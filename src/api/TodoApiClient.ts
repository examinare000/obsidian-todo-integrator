// Microsoft Graph API Client for Todo operations
// Uses Direct Fetch implementation to avoid JWT token issues

import {
	TodoTask,
	TodoList,
	UserInfo,
	TokenProvider,
	Logger,
	ErrorContext,
	ApiResponse,
	GraphApiError,
} from '../types';
import { GRAPH_ENDPOINTS, ERROR_CODES } from '../constants';
import { SecureErrorHandler } from '../utils/secureErrorHandler';

export class TodoApiClient {
	private tokenProvider: TokenProvider | null = null;
	private logger: Logger;
	private defaultListId: string | null = null;
	private errorHandler: SecureErrorHandler;

	constructor(logger: Logger) {
		this.logger = logger;
		this.errorHandler = new SecureErrorHandler(logger);
	}

	initialize(tokenProvider: TokenProvider): void {
		this.tokenProvider = tokenProvider;
		this.logger.info('TodoApiClient initialized with token provider');
	}

	isInitialized(): boolean {
		return this.tokenProvider !== null;
	}

	async updateTaskTitle(listId: string, taskId: string, newTitle: string): Promise<void> {
		this.validateInitialization();

		try {
			const accessToken = await this.getAccessToken();
			const response = await fetch(GRAPH_ENDPOINTS.TASK(listId, taskId), {
				method: 'PATCH',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					title: newTitle,
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to update task title: HTTP ${response.status}`);
			}

			this.logger.info('Task title updated successfully', {
				listId,
				taskId,
				newTitle,
			});

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoApiClient',
				method: 'updateTaskTitle',
				timestamp: new Date().toISOString(),
				details: { listId, taskId, newTitle, error },
			};
			this.logger.error('Failed to update task title', context);
			throw new Error(`${ERROR_CODES.API_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	async getUserInfo(): Promise<UserInfo> {
		this.validateInitialization();

		try {
			const accessToken = await this.getAccessToken();
			const response = await fetch(GRAPH_ENDPOINTS.USER_INFO, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const userData = await response.json();
			
			const userInfo: UserInfo = {
				id: userData.id || '',
				displayName: userData.displayName || '',
				email: userData.mail || userData.userPrincipalName || '',
			};

			this.logger.info('User information retrieved successfully', {
				displayName: userInfo.displayName,
				email: userInfo.email,
			});

			return userInfo;

		} catch (error) {
			const secureError = this.errorHandler.handleApiError(error, 'ユーザー情報取得');
			throw new Error(`${ERROR_CODES.API_ERROR}: ${secureError.userMessage}`);
		}
	}

	async getOrCreateTaskList(listName: string): Promise<string> {
		this.validateInitialization();

		try {
			// First, try to find existing list
			const existingListId = await this.findTaskList(listName);
			if (existingListId) {
				this.defaultListId = existingListId;
				return existingListId;
			}

			// Create new list if not found
			this.logger.info(`Creating new task list: ${listName}`);
			const newListId = await this.createTaskList(listName);
			this.defaultListId = newListId;
			return newListId;

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoApiClient',
				method: 'getOrCreateTaskList',
				timestamp: new Date().toISOString(),
				details: { listName, error },
			};
			this.logger.error('Failed to get or create task list', context);
			throw error;
		}
	}

	private async findTaskList(listName: string): Promise<string | null> {
		const accessToken = await this.getAccessToken();
		const response = await fetch(GRAPH_ENDPOINTS.TODO_LISTS, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch task lists: HTTP ${response.status}`);
		}

		const data: ApiResponse<TodoList> = await response.json();
		const lists = data.value || [];

		const targetList = lists.find(list => list.displayName === listName);
		if (targetList) {
			this.logger.debug(`Found existing task list: ${listName}`, { listId: targetList.id });
			return targetList.id;
		}

		return null;
	}

	private async createTaskList(listName: string): Promise<string> {
		const accessToken = await this.getAccessToken();
		const response = await fetch(GRAPH_ENDPOINTS.TODO_LISTS, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				displayName: listName,
			}),
		});

		if (!response.ok) {
			throw new Error(`Failed to create task list: HTTP ${response.status}`);
		}

		const newList: TodoList = await response.json();
		this.logger.info(`Created new task list: ${listName}`, { listId: newList.id });
		return newList.id;
	}

	async getTasks(listId?: string): Promise<TodoTask[]> {
		this.validateInitialization();

		const targetListId = listId || this.defaultListId;
		if (!targetListId) {
			throw new Error('No task list specified and no default list set');
		}

		try {
			const accessToken = await this.getAccessToken();
			const response = await fetch(GRAPH_ENDPOINTS.TASKS(targetListId), {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch tasks: HTTP ${response.status}`);
			}

			const data: ApiResponse<TodoTask> = await response.json();
			const tasks = data.value || [];

			this.logger.debug(`Retrieved ${tasks.length} tasks from list`, { listId: targetListId });
			return tasks;

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoApiClient',
				method: 'getTasks',
				timestamp: new Date().toISOString(),
				details: { listId: targetListId, error },
			};
			this.logger.error('Failed to get tasks', context);
			throw new Error(`${ERROR_CODES.API_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	async createTask(listId: string, title: string): Promise<TodoTask> {
		return this.createTaskWithStartDate(listId, title);
	}

	async createTaskWithStartDate(listId: string, title: string, startDate?: string): Promise<TodoTask> {
		this.validateInitialization();

		try {
			const accessToken = await this.getAccessToken();
			
			// Clean title to ensure no [todo:: tags are included
			const cleanTitle = title.replace(/\[todo::[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
			
			const taskData: any = {
				title: cleanTitle,
			};

			if (startDate) {
				// Convert date string to ISO format for Microsoft Graph API
				const dateObj = new Date(startDate);
				taskData.startDateTime = {
					dateTime: dateObj.toISOString(),
					timeZone: 'UTC',
				};
			}

			const response = await fetch(GRAPH_ENDPOINTS.TASKS(listId), {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(taskData),
			});

			if (!response.ok) {
				throw new Error(`Failed to create task: HTTP ${response.status}`);
			}

			const newTask: TodoTask = await response.json();
			this.logger.info('[DEBUG] Task created successfully', {
				taskId: newTask.id,
				title: newTask.title,
				originalTitle: title,
				cleanTitle: cleanTitle,
				startDate: startDate
			});

			return newTask;

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoApiClient',
				method: 'createTaskWithStartDate',
				timestamp: new Date().toISOString(),
				details: { listId, title, startDate, error },
			};
			this.logger.error('Failed to create task with start date', context);
			throw new Error(`${ERROR_CODES.API_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	async completeTask(listId: string, taskId: string): Promise<void> {
		this.validateInitialization();

		try {
			const accessToken = await this.getAccessToken();
			const response = await fetch(GRAPH_ENDPOINTS.TASK(listId, taskId), {
				method: 'PATCH',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					status: 'completed',
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to complete task: HTTP ${response.status}`);
			}

			this.logger.info('Task completed successfully', {
				listId,
				taskId,
			});

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoApiClient',
				method: 'completeTask',
				timestamp: new Date().toISOString(),
				details: { listId, taskId, error },
			};
			this.logger.error('Failed to complete task', context);
			throw new Error(`${ERROR_CODES.API_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	async deleteTask(listId: string, taskId: string): Promise<void> {
		this.validateInitialization();

		try {
			const accessToken = await this.getAccessToken();
			const response = await fetch(GRAPH_ENDPOINTS.TASK(listId, taskId), {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to delete task: HTTP ${response.status}`);
			}

			this.logger.info('Task deleted successfully', {
				listId,
				taskId,
			});

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoApiClient',
				method: 'deleteTask',
				timestamp: new Date().toISOString(),
				details: { listId, taskId, error },
			};
			this.logger.error('Failed to delete task', context);
			throw new Error(`${ERROR_CODES.API_ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	getDefaultListId(): string | null {
		return this.defaultListId;
	}

	setDefaultListId(listId: string): void {
		this.defaultListId = listId;
		this.logger.debug('Default list ID updated', { listId });
	}

	private validateInitialization(): void {
		if (!this.tokenProvider) {
			throw new Error('API client not initialized. Call initialize() first.');
		}
	}

	private async getAccessToken(): Promise<string> {
		if (!this.tokenProvider) {
			throw new Error('Token provider not available');
		}

		try {
			return await this.tokenProvider();
		} catch (error) {
			this.logger.error('Failed to get access token', { error });
			throw new Error(`${ERROR_CODES.TOKEN_EXPIRED}: Failed to get access token`);
		}
	}

	private handleApiError(error: any): never {
		if (error.error) {
			const graphError = error as GraphApiError;
			throw new Error(`Graph API Error: ${graphError.error.code} - ${graphError.error.message}`);
		}
		
		throw new Error(`API Error: ${error.message || 'Unknown error'}`);
	}
}