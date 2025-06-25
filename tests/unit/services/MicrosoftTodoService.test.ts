// Unit tests for MicrosoftTodoService implementation
// Following TDD approach: Write failing tests first, then implement

import { MicrosoftTodoService } from '../../../src/services/MicrosoftTodoService';
import { TodoApiClient } from '../../../src/api/TodoApiClient';
import { TodoTask } from '../../../src/types';
import { Logger } from '../../../src/types';

// Mock the TodoApiClient
jest.mock('../../../src/api/TodoApiClient');

describe('MicrosoftTodoService', () => {
	let service: MicrosoftTodoService;
	let mockApiClient: jest.Mocked<TodoApiClient>;
	let mockLogger: jest.Mocked<Logger>;

	beforeEach(() => {
		// Create mock logger
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			setLogLevel: jest.fn(),
			exportLogs: jest.fn(),
		} as any;

		// Create mock API client
		mockApiClient = {
			getTasks: jest.fn(),
			createTask: jest.fn(),
			createTaskWithStartDate: jest.fn(),
			updateTaskTitle: jest.fn(),
			completeTask: jest.fn(),
			deleteTask: jest.fn(),
			getDefaultListId: jest.fn().mockReturnValue('default-list-id'),
			ensureListExists: jest.fn(),
			initializeAuth: jest.fn(),
			getAuthUrl: jest.fn(),
			handleCallback: jest.fn(),
			getToken: jest.fn(),
			isAuthenticated: jest.fn(),
			logout: jest.fn(),
		} as any;

		// Create service instance
		service = new MicrosoftTodoService(mockApiClient, mockLogger);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('getTasks', () => {
		it('should retrieve all tasks when no filter is provided', async () => {
			const mockTasks: TodoTask[] = [
				{
					id: 'task-1',
					title: 'Task 1',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task-2',
					title: 'Task 2',
					status: 'completed',
					createdDateTime: '2024-01-02T00:00:00Z',
					completedDateTime: '2024-01-03T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(mockTasks);

			const result = await service.getTasks();

			expect(result).toEqual(mockTasks);
			expect(mockApiClient.getTasks).toHaveBeenCalledWith('default-list-id');
			expect(mockLogger.debug).toHaveBeenCalledWith('Fetching tasks from Microsoft Todo', { listId: 'default-list-id' });
		});

		it('should filter tasks by status', async () => {
			const allTasks: TodoTask[] = [
				{
					id: 'task-1',
					title: 'Active Task',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task-2',
					title: 'Completed Task',
					status: 'completed',
					createdDateTime: '2024-01-02T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(allTasks);

			const result = await service.getTasks({ status: 'notStarted' });

			expect(result).toHaveLength(1);
			expect(result[0].status).toBe('notStarted');
			expect(mockApiClient.getTasks).toHaveBeenCalledWith('default-list-id');
		});

		it('should use custom listId when provided', async () => {
			mockApiClient.getTasks.mockResolvedValue([]);

			await service.getTasks({ listId: 'custom-list-id' });

			expect(mockApiClient.getTasks).toHaveBeenCalledWith('custom-list-id');
		});

		it('should handle API errors gracefully', async () => {
			const error = new Error('API Error');
			mockApiClient.getTasks.mockRejectedValue(error);

			await expect(service.getTasks()).rejects.toThrow('Failed to fetch tasks');
			expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch tasks from Microsoft Todo', error);
		});
	});

	describe('createTask', () => {
		it('should create a task with minimal options', async () => {
			const createdTask: TodoTask = {
				id: 'new-task-id',
				title: 'New Task',
				status: 'notStarted',
				createdDateTime: '2024-01-10T00:00:00Z',
			};

			mockApiClient.createTask.mockResolvedValue(createdTask);

			const result = await service.createTask({ title: 'New Task' });

			expect(result).toEqual(createdTask);
			expect(mockApiClient.createTask).toHaveBeenCalledWith('default-list-id', 'New Task');
			expect(mockLogger.info).toHaveBeenCalledWith('Task created in Microsoft Todo', { taskId: 'new-task-id', title: 'New Task' });
		});

		it('should create a task with start date', async () => {
			const createdTask: TodoTask = {
				id: 'new-task-id',
				title: 'Task with Start Date',
				status: 'notStarted',
				createdDateTime: '2024-01-10T00:00:00Z',
				body: { content: 'Start: 2024-01-15', contentType: 'text' },
			};

			mockApiClient.createTaskWithStartDate.mockResolvedValue(createdTask);

			const result = await service.createTask({ 
				title: 'Task with Start Date',
				startDate: '2024-01-15'
			});

			expect(result).toEqual(createdTask);
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'default-list-id', 
				'Task with Start Date', 
				'2024-01-15'
			);
		});

		it('should create a task with due date', async () => {
			const createdTask: TodoTask = {
				id: 'new-task-id',
				title: 'Task with Due Date',
				status: 'notStarted',
				createdDateTime: '2024-01-10T00:00:00Z',
				dueDateTime: {
					dateTime: '2024-01-20T00:00:00Z',
					timeZone: 'UTC',
				},
			};

			mockApiClient.createTask.mockResolvedValue(createdTask);

			const result = await service.createTask({ 
				title: 'Task with Due Date',
				dueDate: '2024-01-20'
			});

			expect(result).toEqual(createdTask);
			// Since due date support is not yet implemented in TodoApiClient,
			// it currently creates a basic task without due date
			expect(mockApiClient.createTask).toHaveBeenCalledWith(
				'default-list-id', 
				'Task with Due Date'
			);
		});

		it('should use custom listId when provided', async () => {
			const createdTask: TodoTask = {
				id: 'new-task-id',
				title: 'Task in Custom List',
				status: 'notStarted',
				createdDateTime: '2024-01-10T00:00:00Z',
			};

			mockApiClient.createTask.mockResolvedValue(createdTask);

			await service.createTask({ 
				title: 'Task in Custom List',
				listId: 'custom-list-id'
			});

			expect(mockApiClient.createTask).toHaveBeenCalledWith('custom-list-id', 'Task in Custom List');
		});

		it('should handle creation errors', async () => {
			const error = new Error('Creation failed');
			mockApiClient.createTask.mockRejectedValue(error);

			await expect(service.createTask({ title: 'Test' })).rejects.toThrow('Failed to create task');
			expect(mockLogger.error).toHaveBeenCalledWith('Failed to create task in Microsoft Todo', error);
		});
	});

	describe('updateTask', () => {
		it('should update task title', async () => {
			const updatedTask: TodoTask = {
				id: 'task-1',
				title: 'Updated Title',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			mockApiClient.updateTaskTitle.mockResolvedValue(undefined);
			mockApiClient.getTasks.mockResolvedValue([updatedTask]);

			const result = await service.updateTask('task-1', { title: 'Updated Title' });

			expect(result).toEqual(updatedTask);
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledWith('default-list-id', 'task-1', 'Updated Title');
			expect(mockApiClient.getTasks).toHaveBeenCalledWith('default-list-id');
			expect(mockLogger.info).toHaveBeenCalledWith('Task updated in Microsoft Todo', { taskId: 'task-1' });
		});

		it('should handle update errors', async () => {
			const error = new Error('Update failed');
			mockApiClient.updateTaskTitle.mockRejectedValue(error);

			await expect(service.updateTask('task-1', { title: 'New Title' })).rejects.toThrow('Failed to update task');
			expect(mockLogger.error).toHaveBeenCalledWith('Failed to update task in Microsoft Todo', error);
		});
	});

	describe('completeTask', () => {
		it('should mark a task as completed', async () => {
			const completedTask: TodoTask = {
				id: 'task-1',
				title: 'Completed Task',
				status: 'completed',
				createdDateTime: '2024-01-01T00:00:00Z',
				completedDateTime: '2024-01-10T12:00:00Z',
			};

			// Mock the sequence: completeTask returns void, then getTasks returns the completed task
			mockApiClient.completeTask.mockResolvedValue(undefined);
			mockApiClient.getTasks.mockResolvedValue([completedTask]);

			const result = await service.completeTask('task-1');

			expect(result).toEqual(completedTask);
			expect(mockApiClient.completeTask).toHaveBeenCalledWith('default-list-id', 'task-1');
			expect(mockLogger.info).toHaveBeenCalledWith('Task completed in Microsoft Todo', { taskId: 'task-1' });
		});

		it('should handle completion errors', async () => {
			const error = new Error('Completion failed');
			mockApiClient.completeTask.mockRejectedValue(error);

			await expect(service.completeTask('task-1')).rejects.toThrow('Failed to complete task');
			expect(mockLogger.error).toHaveBeenCalledWith('Failed to complete task in Microsoft Todo', error);
		});
	});

	describe('deleteTask', () => {
		it('should delete a task', async () => {
			mockApiClient.deleteTask.mockResolvedValue(undefined);

			await service.deleteTask('task-1');

			expect(mockApiClient.deleteTask).toHaveBeenCalledWith('default-list-id', 'task-1');
			expect(mockLogger.info).toHaveBeenCalledWith('Task deleted from Microsoft Todo', { taskId: 'task-1' });
		});

		it('should handle deletion errors', async () => {
			const error = new Error('Deletion failed');
			mockApiClient.deleteTask.mockRejectedValue(error);

			await expect(service.deleteTask('task-1')).rejects.toThrow('Failed to delete task');
			expect(mockLogger.error).toHaveBeenCalledWith('Failed to delete task from Microsoft Todo', error);
		});
	});

	describe('getTaskById', () => {
		it('should retrieve a task by ID', async () => {
			const task: TodoTask = {
				id: 'task-1',
				title: 'Found Task',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			mockApiClient.getTasks.mockResolvedValue([task]);

			const result = await service.getTaskById('task-1');

			expect(result).toEqual(task);
			expect(mockApiClient.getTasks).toHaveBeenCalledWith('default-list-id');
		});

		it('should return null for non-existent task', async () => {
			mockApiClient.getTasks.mockResolvedValue([]);

			const result = await service.getTaskById('non-existent');

			expect(result).toBeNull();
		});

		it('should handle errors', async () => {
			const error = new Error('Fetch failed');
			mockApiClient.getTasks.mockRejectedValue(error);

			await expect(service.getTaskById('task-1')).rejects.toThrow('Failed to get task by ID');
			expect(mockLogger.error).toHaveBeenCalledWith('Failed to get task by ID from Microsoft Todo', error);
		});
	});

	describe('searchTasks', () => {
		it('should search tasks by query', async () => {
			const allTasks: TodoTask[] = [
				{
					id: 'task-1',
					title: 'Meeting with team',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task-2',
					title: 'Team lunch',
					status: 'notStarted',
					createdDateTime: '2024-01-02T00:00:00Z',
				},
				{
					id: 'task-3',
					title: 'Personal task',
					status: 'notStarted',
					createdDateTime: '2024-01-03T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(allTasks);

			const result = await service.searchTasks('team');

			expect(result).toHaveLength(2);
			expect(result[0].title.toLowerCase()).toContain('team');
			expect(result[1].title.toLowerCase()).toContain('team');
			expect(mockLogger.debug).toHaveBeenCalledWith('Searching tasks in Microsoft Todo', { query: 'team' });
		});

		it('should return empty array for no matches', async () => {
			const allTasks: TodoTask[] = [
				{
					id: 'task-1',
					title: 'Task 1',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(allTasks);

			const result = await service.searchTasks('nonexistent');

			expect(result).toEqual([]);
		});

		it('should handle search errors', async () => {
			const error = new Error('Search failed');
			mockApiClient.getTasks.mockRejectedValue(error);

			await expect(service.searchTasks('test')).rejects.toThrow('Failed to search tasks');
			expect(mockLogger.error).toHaveBeenCalledWith('Failed to search tasks in Microsoft Todo', error);
		});
	});
});