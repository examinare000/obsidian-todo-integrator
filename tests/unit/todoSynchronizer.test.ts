// Tests for TodoSynchronizer

import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { TodoApiClient } from '../../src/api/TodoApiClient';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { TodoTask, DailyNoteTask, SyncResult } from '../../src/types';

// Mock dependencies
jest.mock('../../src/api/TodoApiClient');
jest.mock('../../src/sync/DailyNoteManager');

describe('TodoSynchronizer', () => {
	let synchronizer: TodoSynchronizer;
	let mockApiClient: jest.Mocked<TodoApiClient>;
	let mockDailyNoteManager: jest.Mocked<DailyNoteManager>;
	let mockLogger: any;

	beforeEach(() => {
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};

		mockApiClient = {
			getTasks: jest.fn(),
			createTask: jest.fn(),
			createTaskWithStartDate: jest.fn(),
			completeTask: jest.fn(),
			getDefaultListId: jest.fn(),
		} as any;

		mockDailyNoteManager = {
			ensureTodayNoteExists: jest.fn(),
			getDailyNoteTasks: jest.fn(),
			getAllDailyNoteTasks: jest.fn(),
			addTaskToTodoSection: jest.fn(),
			updateTaskCompletion: jest.fn(),
			getTodayNotePath: jest.fn(),
			getNotePath: jest.fn(),
			app: {
				vault: {
					getAbstractFileByPath: jest.fn().mockReturnValue({
						name: 'test.md',
						path: 'Daily Notes/2024-01-15.md'
					}),
					create: jest.fn().mockResolvedValue(undefined),
					read: jest.fn().mockResolvedValue('- [ ] New Obsidian Task'),
					modify: jest.fn().mockResolvedValue(undefined),
				}
			}
		} as any;

		synchronizer = new TodoSynchronizer(
			mockApiClient,
			mockDailyNoteManager,
			mockLogger
		);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('performFullSync', () => {
		it('should perform complete synchronization', async () => {
			// Mock data
			const msftTasks: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'Microsoft Task 1',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Obsidian Task 1',
					completed: false,
					lineNumber: 5,
				},
			];

			// Setup mocks
			mockDailyNoteManager.ensureTodayNoteExists.mockResolvedValue('2024-01-15.md');
			mockDailyNoteManager.getTodayNotePath.mockReturnValue('Daily Notes/2024-01-15.md');
			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getDailyNoteTasks.mockResolvedValue(dailyTasks);
			
			// Mock individual sync operations
			jest.spyOn(synchronizer, 'syncMsftToObsidian').mockResolvedValue({
				added: 1,
				errors: [],
			});
			
			jest.spyOn(synchronizer, 'syncObsidianToMsft').mockResolvedValue({
				added: 1,
				errors: [],
			});
			
			jest.spyOn(synchronizer, 'syncCompletions').mockResolvedValue({
				completed: 0,
				errors: [],
			});

			const result = await synchronizer.performFullSync();

			expect(result).toEqual({
				msftToObsidian: { added: 1, errors: [] },
				obsidianToMsft: { added: 1, errors: [] },
				completions: { completed: 0, errors: [] },
				timestamp: expect.any(String),
			});

			expect(mockDailyNoteManager.ensureTodayNoteExists).toHaveBeenCalled();
		});
	});

	describe('syncMsftToObsidian', () => {
		it('should sync new Microsoft tasks to Obsidian', async () => {
			const msftTasks: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'New Microsoft Task',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const dailyTasks: DailyNoteTask[] = [];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockDailyNoteManager.getNotePath.mockReturnValue('Daily Notes/2024-01-01.md');
			mockDailyNoteManager.addTaskToTodoSection.mockResolvedValue(undefined);

			const result = await synchronizer.syncMsftToObsidian();

			expect(result.added).toBe(1);
			expect(result.errors).toHaveLength(0);
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-01.md',
				'New Microsoft Task',
				'msft-1',
				undefined
			);
		});

		it('should skip tasks that already exist in Obsidian', async () => {
			const msftTasks: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'Existing Task',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Existing Task',
					completed: false,
					lineNumber: 5,
					todoId: 'msft-1',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);

			const result = await synchronizer.syncMsftToObsidian();

			expect(result.added).toBe(0);
			expect(mockDailyNoteManager.addTaskToTodoSection).not.toHaveBeenCalled();
		});
	});

	describe('syncObsidianToMsft', () => {
		it('should sync new Obsidian tasks to Microsoft', async () => {
			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'New Obsidian Task',
					completed: false,
					lineNumber: 5,
					filePath: 'Daily Notes/2024-01-15.md',
					startDate: '2024-01-15',
				},
			];

			const msftTasks: TodoTask[] = [];
			const createdTask: TodoTask = {
				id: 'new-msft-id',
				title: 'New Obsidian Task',
				status: 'notStarted',
				createdDateTime: '2024-01-15T00:00:00Z',
			};

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockApiClient.getDefaultListId.mockReturnValue('default-list-id');
			mockApiClient.createTaskWithStartDate.mockResolvedValue(createdTask);

			const result = await synchronizer.syncObsidianToMsft();

			expect(result.added).toBe(1);
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'default-list-id',
				'New Obsidian Task',
				'2024-01-15'
			);
		});

		it('should skip tasks that already have Microsoft IDs', async () => {
			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Existing Task',
					completed: false,
					lineNumber: 5,
					todoId: 'msft-123',
				},
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);

			const result = await synchronizer.syncObsidianToMsft();

			expect(result.added).toBe(0);
			expect(mockApiClient.createTaskWithStartDate).not.toHaveBeenCalled();
		});
	});

	describe('syncCompletions', () => {
		it('should sync completed tasks from Microsoft to Obsidian', async () => {
			const msftTasks: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'Completed Task',
					status: 'completed',
					createdDateTime: '2024-01-01T00:00:00Z',
					completedDateTime: '2024-01-15T10:00:00Z',
				},
			];

			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Completed Task',
					completed: false,
					lineNumber: 5,
					todoId: 'msft-1',
					filePath: 'Daily Notes/2024-01-15.md',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockDailyNoteManager.updateTaskCompletion.mockResolvedValue(undefined);

			const result = await synchronizer.syncCompletions();

			expect(result.completed).toBe(1);
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'Daily Notes/2024-01-15.md',
				5,
				true,
				'2024-01-15'
			);
		});

		it('should sync completed tasks from Obsidian to Microsoft', async () => {
			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Completed Task',
					completed: true,
					lineNumber: 5,
					completionDate: '2024-01-15',
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
				},
			];

			const msftTasks: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'Completed Task',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockApiClient.getDefaultListId.mockReturnValue('default-list-id');
			mockApiClient.completeTask.mockResolvedValue(undefined);

			const result = await synchronizer.syncCompletions();

			expect(result.completed).toBe(1);
			expect(mockApiClient.completeTask).toHaveBeenCalledWith(
				'default-list-id',
				'msft-1'
			);
		});
	});

	describe('detectDuplicates', () => {
		it('should detect duplicate tasks by title', () => {
			const obsidianTasks: any[] = [
				{ title: 'Task 1', todoId: undefined },
				{ title: 'Task 2', todoId: 'msft-2' },
			];

			const msftTasks: any[] = [
				{ id: 'msft-1', title: 'Task 1' },
				{ id: 'msft-2', title: 'Task 2' },
				{ id: 'msft-3', title: 'Task 3' },
			];

			const duplicates = synchronizer.detectDuplicates(obsidianTasks, msftTasks);

			expect(duplicates).toHaveLength(1);
			expect(duplicates[0]).toEqual({
				obsidianTask: obsidianTasks[0],
				msftTask: msftTasks[0],
				confidence: 1.0,
			});
		});
	});
});