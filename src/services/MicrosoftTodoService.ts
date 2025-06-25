// MicrosoftTodoService implementation
// Implements TodoService interface for Microsoft Todo integration

import { TodoService, TaskFilterOptions, CreateTaskOptions, UpdateTaskOptions } from './TodoService';
import { TodoTask } from '../types';
import { TodoApiClient } from '../api/TodoApiClient';
import { Logger } from '../types';

/**
 * Microsoft Todo service implementation
 * Provides integration with Microsoft Todo via Graph API
 */
export class MicrosoftTodoService implements TodoService {
	private apiClient: TodoApiClient;
	private logger: Logger;

	constructor(apiClient: TodoApiClient, logger: Logger) {
		this.apiClient = apiClient;
		this.logger = logger;
	}

	/**
	 * Retrieve tasks from Microsoft Todo
	 */
	async getTasks(options?: TaskFilterOptions): Promise<TodoTask[]> {
		try {
			const listId = options?.listId || this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No list ID available');
			}

			this.logger.debug('Fetching tasks from Microsoft Todo', { listId });
			const tasks = await this.apiClient.getTasks(listId);

			// Apply client-side filtering if needed
			let filteredTasks = tasks;
			if (options?.status) {
				filteredTasks = filteredTasks.filter(task => task.status === options.status);
			}

			return filteredTasks;
		} catch (error) {
			this.logger.error('Failed to fetch tasks from Microsoft Todo', error);
			throw new Error('Failed to fetch tasks');
		}
	}

	/**
	 * Create a new task in Microsoft Todo
	 */
	async createTask(task: CreateTaskOptions): Promise<TodoTask> {
		try {
			const listId = task.listId || this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No list ID available');
			}

			let createdTask: TodoTask;

			// Handle different creation scenarios
			if (task.startDate) {
				// Use specialized method for tasks with start date
				createdTask = await this.apiClient.createTaskWithStartDate(
					listId,
					task.title,
					task.startDate
				);
			} else {
				// Create basic task (for now, due date support needs to be added to TodoApiClient)
				createdTask = await this.apiClient.createTask(listId, task.title);
			}

			this.logger.info('Task created in Microsoft Todo', { 
				taskId: createdTask.id, 
				title: createdTask.title 
			});

			return createdTask;
		} catch (error) {
			this.logger.error('Failed to create task in Microsoft Todo', error);
			throw new Error('Failed to create task');
		}
	}

	/**
	 * Update an existing task
	 */
	async updateTask(taskId: string, updates: UpdateTaskOptions): Promise<TodoTask> {
		try {
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No list ID available');
			}

			// Currently only title update is supported by the API client
			if (updates.title) {
				const updatedTask = await this.apiClient.updateTaskTitle(listId, taskId, updates.title);
				this.logger.info('Task updated in Microsoft Todo', { taskId });
				return updatedTask;
			}

			// If no supported updates, fetch and return current task
			const tasks = await this.apiClient.getTasks(listId);
			const currentTask = tasks.find(t => t.id === taskId);
			if (!currentTask) {
				throw new Error(`Task ${taskId} not found`);
			}

			return currentTask;
		} catch (error) {
			this.logger.error('Failed to update task in Microsoft Todo', error);
			throw new Error('Failed to update task');
		}
	}

	/**
	 * Mark a task as completed
	 */
	async completeTask(taskId: string): Promise<TodoTask> {
		try {
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No list ID available');
			}

			// Complete the task
			await this.apiClient.completeTask(listId, taskId);
			
			// Fetch the updated task
			const tasks = await this.apiClient.getTasks(listId);
			const completedTask = tasks.find(t => t.id === taskId);
			
			if (!completedTask) {
				throw new Error(`Task ${taskId} not found after completion`);
			}

			this.logger.info('Task completed in Microsoft Todo', { taskId });
			return completedTask;
		} catch (error) {
			this.logger.error('Failed to complete task in Microsoft Todo', error);
			throw new Error('Failed to complete task');
		}
	}

	/**
	 * Delete a task from Microsoft Todo
	 */
	async deleteTask(taskId: string): Promise<void> {
		try {
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No list ID available');
			}

			await this.apiClient.deleteTask(listId, taskId);
			this.logger.info('Task deleted from Microsoft Todo', { taskId });
		} catch (error) {
			this.logger.error('Failed to delete task from Microsoft Todo', error);
			throw new Error('Failed to delete task');
		}
	}

	/**
	 * Get a specific task by ID
	 */
	async getTaskById(taskId: string): Promise<TodoTask | null> {
		try {
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No list ID available');
			}

			const tasks = await this.apiClient.getTasks(listId);
			const task = tasks.find(t => t.id === taskId);
			
			return task || null;
		} catch (error) {
			this.logger.error('Failed to get task by ID from Microsoft Todo', error);
			throw new Error('Failed to get task by ID');
		}
	}

	/**
	 * Search tasks by text query
	 */
	async searchTasks(query: string): Promise<TodoTask[]> {
		try {
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No list ID available');
			}

			this.logger.debug('Searching tasks in Microsoft Todo', { query });
			
			// Fetch all tasks and filter client-side
			// Note: Microsoft Graph API doesn't support text search on tasks directly
			const tasks = await this.apiClient.getTasks(listId);
			const lowerQuery = query.toLowerCase();
			
			return tasks.filter(task => 
				task.title.toLowerCase().includes(lowerQuery) ||
				(task.body?.content && task.body.content.toLowerCase().includes(lowerQuery))
			);
		} catch (error) {
			this.logger.error('Failed to search tasks in Microsoft Todo', error);
			throw new Error('Failed to search tasks');
		}
	}
}