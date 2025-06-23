// Tests for TodoApiClient (Direct Fetch Implementation)

import { TodoApiClient } from '../../src/api/TodoApiClient';
import { TodoTask, TodoList, TokenProvider } from '../../src/types';

// Mock fetch globally
global.fetch = jest.fn();

describe('TodoApiClient', () => {
	let apiClient: TodoApiClient;
	let mockLogger: any;
	let mockTokenProvider: TokenProvider;

	beforeEach(() => {
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};
		
		mockTokenProvider = jest.fn().mockResolvedValue('mock-access-token');
		apiClient = new TodoApiClient(mockLogger);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('initialization', () => {
		it('should initialize with token provider', () => {
			apiClient.initialize(mockTokenProvider);
			expect(apiClient.isInitialized()).toBe(true);
		});

		it('should require initialization before API calls', async () => {
			await expect(apiClient.getUserInfo()).rejects.toThrow('API client not initialized');
		});
	});

	describe('getUserInfo', () => {
		beforeEach(() => {
			apiClient.initialize(mockTokenProvider);
		});

		it('should fetch user information successfully', async () => {
			const mockUserData = {
				id: 'user-123',
				displayName: 'Test User',
				mail: 'test@example.com',
			};

			(fetch as jest.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockUserData),
			});

			const userInfo = await apiClient.getUserInfo();

			expect(fetch).toHaveBeenCalledWith(
				'https://graph.microsoft.com/v1.0/me',
				expect.objectContaining({
					headers: expect.objectContaining({
						'Authorization': 'Bearer mock-access-token',
					}),
				})
			);

			expect(userInfo).toEqual({
				id: 'user-123',
				displayName: 'Test User',
				email: 'test@example.com',
			});
		});

		it('should handle API errors', async () => {
			(fetch as jest.Mock).mockResolvedValue({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
			});

			await expect(apiClient.getUserInfo()).rejects.toThrow('API_ERROR');
		});
	});

	describe('getOrCreateTaskList', () => {
		beforeEach(() => {
			apiClient.initialize(mockTokenProvider);
		});

		it('should return existing task list if found', async () => {
			const mockLists = {
				value: [
					{ id: 'list-1', displayName: 'Obsidian Tasks' },
					{ id: 'list-2', displayName: 'Other List' },
				],
			};

			(fetch as jest.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockLists),
			});

			const listId = await apiClient.getOrCreateTaskList('Obsidian Tasks');

			expect(listId).toBe('list-1');
		});

		it('should create new task list if not found', async () => {
			const mockExistingLists = { value: [] };
			const mockNewList = { id: 'new-list-id', displayName: 'New List' };

			(fetch as jest.Mock)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(mockExistingLists),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(mockNewList),
				});

			const listId = await apiClient.getOrCreateTaskList('New List');

			expect(fetch).toHaveBeenCalledTimes(2);
			expect(listId).toBe('new-list-id');
		});
	});

	describe('getTasks', () => {
		beforeEach(() => {
			apiClient.initialize(mockTokenProvider);
		});

		it('should fetch tasks from specified list', async () => {
			const mockTasks = {
				value: [
					{
						id: 'task-1',
						title: 'Test Task 1',
						status: 'notStarted',
						createdDateTime: '2024-01-01T00:00:00Z',
					},
					{
						id: 'task-2',
						title: 'Test Task 2',
						status: 'completed',
						createdDateTime: '2024-01-02T00:00:00Z',
						completedDateTime: '2024-01-03T00:00:00Z',
					},
				],
			};

			(fetch as jest.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockTasks),
			});

			const tasks = await apiClient.getTasks('list-id');

			expect(fetch).toHaveBeenCalledWith(
				'https://graph.microsoft.com/v1.0/me/todo/lists/list-id/tasks',
				expect.any(Object)
			);

			expect(tasks).toHaveLength(2);
			expect(tasks[0].title).toBe('Test Task 1');
		});
	});

	describe('createTask', () => {
		beforeEach(() => {
			apiClient.initialize(mockTokenProvider);
		});

		it('should create a new task', async () => {
			const mockCreatedTask = {
				id: 'new-task-id',
				title: 'New Task',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			(fetch as jest.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockCreatedTask),
			});

			const task = await apiClient.createTask('list-id', 'New Task');

			expect(fetch).toHaveBeenCalledWith(
				'https://graph.microsoft.com/v1.0/me/todo/lists/list-id/tasks',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/json',
					}),
					body: expect.stringContaining('"title":"New Task"'),
				})
			);

			expect(task.title).toBe('New Task');
		});
	});

	describe('completeTask', () => {
		beforeEach(() => {
			apiClient.initialize(mockTokenProvider);
		});

		it('should mark task as completed', async () => {
			(fetch as jest.Mock).mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({}),
			});

			await apiClient.completeTask('list-id', 'task-id');

			expect(fetch).toHaveBeenCalledWith(
				'https://graph.microsoft.com/v1.0/me/todo/lists/list-id/tasks/task-id',
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('"status":"completed"'),
				})
			);
		});
	});
});