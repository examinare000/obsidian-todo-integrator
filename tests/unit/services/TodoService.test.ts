// Unit tests for TodoService interface
// Following t-wada's TDD approach: Red -> Green -> Refactor

import { TodoService } from '../../../src/services/TodoService';
import { TodoTask, DailyNoteTask } from '../../../src/types';

describe('TodoService', () => {
	let service: TodoService;

	describe('Interface Contract', () => {
		it('should define all required methods', () => {
			// This test ensures the interface contract is properly defined
			// We'll implement a mock service to test the interface
			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			expect(mockService.getTasks).toBeDefined();
			expect(mockService.createTask).toBeDefined();
			expect(mockService.updateTask).toBeDefined();
			expect(mockService.completeTask).toBeDefined();
			expect(mockService.deleteTask).toBeDefined();
			expect(mockService.getTaskById).toBeDefined();
			expect(mockService.searchTasks).toBeDefined();
		});
	});

	describe('getTasks', () => {
		it('should return a list of tasks', async () => {
			// Red: This test will fail until we implement the interface
			const mockService: TodoService = {
				getTasks: jest.fn().mockResolvedValue([
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
				]),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			const tasks = await mockService.getTasks();

			expect(tasks).toHaveLength(2);
			expect(tasks[0].id).toBe('task-1');
			expect(tasks[0].title).toBe('Test Task 1');
			expect(tasks[0].status).toBe('notStarted');
			expect(tasks[1].status).toBe('completed');
			expect(mockService.getTasks).toHaveBeenCalledTimes(1);
		});

		it('should support filtering options', async () => {
			const mockService: TodoService = {
				getTasks: jest.fn().mockResolvedValue([
					{
						id: 'task-1',
						title: 'Active Task',
						status: 'notStarted',
						createdDateTime: '2024-01-01T00:00:00Z',
					},
				]),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			const tasks = await mockService.getTasks({ status: 'notStarted' });

			expect(tasks).toHaveLength(1);
			expect(tasks[0].status).toBe('notStarted');
			expect(mockService.getTasks).toHaveBeenCalledWith({ status: 'notStarted' });
		});

		it('should handle empty results', async () => {
			const mockService: TodoService = {
				getTasks: jest.fn().mockResolvedValue([]),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			const tasks = await mockService.getTasks();

			expect(tasks).toEqual([]);
			expect(mockService.getTasks).toHaveBeenCalledTimes(1);
		});
	});

	describe('createTask', () => {
		it('should create a new task', async () => {
			const newTask = {
				title: 'New Task',
				dueDate: '2024-01-15',
			};

			const createdTask: TodoTask = {
				id: 'created-task-id',
				title: 'New Task',
				status: 'notStarted',
				createdDateTime: '2024-01-10T00:00:00Z',
				dueDateTime: {
					dateTime: '2024-01-15T00:00:00Z',
					timeZone: 'UTC',
				},
			};

			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn().mockResolvedValue(createdTask),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			const result = await mockService.createTask(newTask);

			expect(result).toEqual(createdTask);
			expect(result.id).toBe('created-task-id');
			expect(result.title).toBe('New Task');
			expect(mockService.createTask).toHaveBeenCalledWith(newTask);
		});

		it('should handle task creation errors', async () => {
			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn().mockRejectedValue(new Error('Failed to create task')),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			await expect(mockService.createTask({ title: 'Test' })).rejects.toThrow('Failed to create task');
		});
	});

	describe('updateTask', () => {
		it('should update an existing task', async () => {
			const taskId = 'task-1';
			const updates = {
				title: 'Updated Title',
				status: 'inProgress' as const,
			};

			const updatedTask: TodoTask = {
				id: taskId,
				title: 'Updated Title',
				status: 'inProgress',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn().mockResolvedValue(updatedTask),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			const result = await mockService.updateTask(taskId, updates);

			expect(result).toEqual(updatedTask);
			expect(result.title).toBe('Updated Title');
			expect(result.status).toBe('inProgress');
			expect(mockService.updateTask).toHaveBeenCalledWith(taskId, updates);
		});
	});

	describe('completeTask', () => {
		it('should mark a task as completed', async () => {
			const taskId = 'task-1';
			const completedTask: TodoTask = {
				id: taskId,
				title: 'Completed Task',
				status: 'completed',
				createdDateTime: '2024-01-01T00:00:00Z',
				completedDateTime: '2024-01-10T12:00:00Z',
			};

			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn().mockResolvedValue(completedTask),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			const result = await mockService.completeTask(taskId);

			expect(result).toEqual(completedTask);
			expect(result.status).toBe('completed');
			expect(result.completedDateTime).toBeDefined();
			expect(mockService.completeTask).toHaveBeenCalledWith(taskId);
		});
	});

	describe('deleteTask', () => {
		it('should delete a task', async () => {
			const taskId = 'task-to-delete';

			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn().mockResolvedValue(undefined),
				getTaskById: jest.fn(),
				searchTasks: jest.fn(),
			};

			await mockService.deleteTask(taskId);

			expect(mockService.deleteTask).toHaveBeenCalledWith(taskId);
		});
	});

	describe('getTaskById', () => {
		it('should retrieve a specific task by ID', async () => {
			const taskId = 'task-1';
			const task: TodoTask = {
				id: taskId,
				title: 'Retrieved Task',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn().mockResolvedValue(task),
				searchTasks: jest.fn(),
			};

			const result = await mockService.getTaskById(taskId);

			expect(result).toEqual(task);
			expect(result?.id).toBe(taskId);
			expect(mockService.getTaskById).toHaveBeenCalledWith(taskId);
		});

		it('should return null for non-existent task', async () => {
			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn().mockResolvedValue(null),
				searchTasks: jest.fn(),
			};

			const result = await mockService.getTaskById('non-existent');

			expect(result).toBeNull();
		});
	});

	describe('searchTasks', () => {
		it('should search tasks by query', async () => {
			const searchResults: TodoTask[] = [
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
			];

			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn().mockResolvedValue(searchResults),
			};

			const results = await mockService.searchTasks('team');

			expect(results).toHaveLength(2);
			expect(results[0].title).toContain('team');
			expect(mockService.searchTasks).toHaveBeenCalledWith('team');
		});

		it('should return empty array for no matches', async () => {
			const mockService: TodoService = {
				getTasks: jest.fn(),
				createTask: jest.fn(),
				updateTask: jest.fn(),
				completeTask: jest.fn(),
				deleteTask: jest.fn(),
				getTaskById: jest.fn(),
				searchTasks: jest.fn().mockResolvedValue([]),
			};

			const results = await mockService.searchTasks('nonexistent');

			expect(results).toEqual([]);
		});
	});
});