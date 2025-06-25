// Tests for TodoSynchronizer

import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { TodoApiClient } from '../../src/api/TodoApiClient';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { TaskMetadataStore } from '../../src/sync/TaskMetadataStore';
import { TodoTask, DailyNoteTask, SyncResult } from '../../src/types';

// Mock dependencies
jest.mock('../../src/api/TodoApiClient');
jest.mock('../../src/sync/DailyNoteManager');

describe('TodoSynchronizer', () => {
	let synchronizer: TodoSynchronizer;
	let mockApiClient: jest.Mocked<TodoApiClient>;
	let mockDailyNoteManager: jest.Mocked<DailyNoteManager>;
	let mockLogger: any;
	let mockPlugin: any;

	beforeEach(() => {
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
		};

		mockPlugin = {
			loadData: jest.fn().mockResolvedValue({}),
			saveData: jest.fn().mockResolvedValue(undefined),
		};

		mockApiClient = {
			getTasks: jest.fn(),
			createTask: jest.fn(),
			createTaskWithStartDate: jest.fn(),
			completeTask: jest.fn(),
			getDefaultListId: jest.fn(),
			updateTaskTitle: jest.fn(),
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
			mockLogger,
			undefined,
			mockPlugin
		);
		
		// Mock the metadata store methods
		const metadataStore = (synchronizer as any).metadataStore;
		jest.spyOn(metadataStore, 'getMsftTaskId').mockImplementation((date: string, title: string) => {
			// Return 'msft-1' for 'Completed Task' to simulate existing metadata
			if (title === 'Completed Task' && (date === '2024-01-15' || date === '2024-01-01')) {
				return 'msft-1';
			}
			return undefined;
		});
		jest.spyOn(metadataStore, 'findByMsftTaskId').mockReturnValue(undefined);
		jest.spyOn(metadataStore, 'setMetadata').mockImplementation(() => {});
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
			mockApiClient.getDefaultListId.mockReturnValue('default-list-id');
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockDailyNoteManager.getNotePath.mockReturnValue('Daily Notes/2024-01-01.md');
			mockDailyNoteManager.addTaskToTodoSection.mockResolvedValue(undefined);
			mockDailyNoteManager.createDailyNote = jest.fn().mockResolvedValue(undefined);

			const result = await synchronizer.syncMsftToObsidian();

			expect(result.added).toBe(1);
			expect(result.errors).toHaveLength(0);
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-01.md',
				'New Microsoft Task',
				undefined
			);
		});

		it('should use due date over creation date when adding tasks', async () => {
			const msftTasks: TodoTask[] = [
				{
					id: 'msft-with-due',
					title: 'Task with Due Date',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
					dueDateTime: {
						dateTime: '2024-01-15T00:00:00Z',
						timeZone: 'UTC'
					}
				},
			];

			const dailyTasks: DailyNoteTask[] = [];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockApiClient.getDefaultListId.mockReturnValue('default-list-id');
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockDailyNoteManager.getNotePath.mockImplementation((date: string) => `Daily Notes/${date}.md`);
			mockDailyNoteManager.addTaskToTodoSection.mockResolvedValue(undefined);
			mockDailyNoteManager.createDailyNote = jest.fn().mockResolvedValue(undefined);

			const result = await synchronizer.syncMsftToObsidian();

			expect(result.added).toBe(1);
			expect(result.errors).toHaveLength(0);
			// Should use due date (2024-01-15) instead of creation date (2024-01-01)
			expect(mockDailyNoteManager.getNotePath).toHaveBeenCalledWith('2024-01-15');
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-15.md',
				'Task with Due Date',
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
					startDate: '2024-01-01',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);

			const result = await synchronizer.syncMsftToObsidian();

			expect(result.added).toBe(0);
			expect(mockDailyNoteManager.addTaskToTodoSection).not.toHaveBeenCalled();
		});

		it('should skip completed Microsoft tasks', async () => {
			const msftTasks: TodoTask[] = [
				{
					id: 'msft-completed-1',
					title: 'Completed Microsoft Task',
					status: 'completed',
					createdDateTime: '2024-01-01T00:00:00Z',
					completedDateTime: '2024-01-02T00:00:00Z',
				},
			];

			const dailyTasks: DailyNoteTask[] = [];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockApiClient.getDefaultListId.mockReturnValue('default-list-id');
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
			
			// Mock metadata store would be set after task creation

			const result = await synchronizer.syncObsidianToMsft();

			expect(result.added).toBe(1);
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'default-list-id',
				'New Obsidian Task',
				'2024-01-15'
			);
		});

		it('should skip tasks that already exist in Microsoft', async () => {
			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Existing Task',
					completed: false,
					lineNumber: 5,
					startDate: '2024-01-01',
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
			// Override the metadata store mock for this specific test
			const metadataStore = (synchronizer as any).metadataStore;
			jest.spyOn(metadataStore, 'findByMsftTaskId').mockImplementation((id: string) => {
				if (id === 'msft-1') {
					return { msftTaskId: 'msft-1', date: '2024-01-15', title: 'Completed Task', lastSynced: Date.now() };
				}
				return undefined;
			});
			
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
					startDate: '2024-01-15',
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
		it('should detect duplicate tasks by title when no metadata exists', () => {
			const obsidianTasks: any[] = [
				{ title: 'Task 1', startDate: '2024-01-01' },
				{ title: 'Task 2', startDate: '2024-01-02' },
			];

			const msftTasks: any[] = [
				{ id: 'msft-1', title: 'Task 1' },
				{ id: 'msft-2', title: 'Task 2' },
				{ id: 'msft-3', title: 'Task 3' },
			];

			const duplicates = synchronizer.detectDuplicates(obsidianTasks, msftTasks);

			// Since we don't have metadata, all matching titles are considered duplicates
			expect(duplicates).toHaveLength(2);
			expect(duplicates[0]).toEqual({
				obsidianTask: obsidianTasks[0],
				msftTask: msftTasks[0],
				confidence: 1.0,
			});
			expect(duplicates[1]).toEqual({
				obsidianTask: obsidianTasks[1],
				msftTask: msftTasks[1],
				confidence: 1.0,
			});
		});
	});

	describe('Completion Sync - Title Matching Fix', () => {
		let mockMetadataStore: any;

		beforeEach(() => {
			// Setup mock metadata store
			mockMetadataStore = {
				setMetadata: jest.fn(),
				getMsftTaskId: jest.fn(),
				getMetadataByDate: jest.fn(),
				findByMsftTaskId: jest.fn(),
				updateTitle: jest.fn(),
				removeMetadata: jest.fn(),
				cleanupOldMetadata: jest.fn(),
				clearAll: jest.fn(),
			};
		});

		it('should use cleaned title when looking up metadata for Obsidian tasks', async () => {
			// Setup: Completed Obsidian task with [todo::ID] pattern
			const obsidianTask = {
				title: 'Test Task [todo::abc123]',
				completed: true,
				startDate: '2024-01-01',
				filePath: 'daily/2024-01-01.md',
				lineNumber: 10,
			};

			// Microsoft task without the [todo::ID] pattern
			const msftTask: TodoTask = {
				id: 'msft-task-123',
				title: 'Test Task',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			// Mock methods
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([obsidianTask]);
			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockApiClient.getDefaultListId.mockReturnValue('list-123');

			// Mock metadata lookup to return the task ID
			mockMetadataStore.getMsftTaskId.mockReturnValue('msft-task-123');
			
			// Create synchronizer with the mocked metadata store
			synchronizer = new TodoSynchronizer(
				mockApiClient,
				mockDailyNoteManager,
				mockLogger,
				'## TODO',
				mockPlugin
			);
			// Replace the metadata store with our mock
			(synchronizer as any).metadataStore = mockMetadataStore;

			// Execute completion sync
			const result = await synchronizer.syncCompletions();

			// Verify task was marked as completed in Microsoft
			expect(mockApiClient.completeTask).toHaveBeenCalledWith('list-123', 'msft-task-123');
			expect(result.completed).toBe(1);
		});

		it('should match daily tasks using cleaned title from metadata', async () => {
			// Setup: Microsoft completed task
			const msftTask: TodoTask = {
				id: 'msft-task-123',
				title: 'Test Task',
				status: 'completed',
				completedDateTime: '2024-01-01T10:00:00Z',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			// Obsidian task with [todo::ID] pattern
			const obsidianTask = {
				title: 'Test Task [todo::abc123]',
				completed: false,
				startDate: '2024-01-01',
				filePath: 'daily/2024-01-01.md',
				lineNumber: 10,
			};

			// Mock methods
			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([obsidianTask]);
			mockDailyNoteManager.updateTaskCompletion.mockResolvedValue();

			// Mock metadata lookup
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'msft-task-123',
				date: '2024-01-01',
				title: 'Test Task', // Cleaned title stored in metadata
				lastSynced: Date.now(),
			});
			
			// Create synchronizer with the mocked metadata store
			synchronizer = new TodoSynchronizer(
				mockApiClient,
				mockDailyNoteManager,
				mockLogger,
				'## TODO',
				mockPlugin
			);
			// Replace the metadata store with our mock
			(synchronizer as any).metadataStore = mockMetadataStore;

			// Execute completion sync
			const result = await synchronizer.syncCompletions();

			// Verify task was marked as completed in Obsidian
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'daily/2024-01-01.md',
				10,
				true,
				'2024-01-01'
			);
			expect(result.completed).toBe(1);
		});

		it('should store metadata with cleaned title when creating from Obsidian', async () => {
			// Setup: New Obsidian task with [todo::ID] pattern
			const obsidianTask = {
				title: 'New Task [todo::xyz789]',
				completed: false,
				startDate: '2024-01-02',
				filePath: 'daily/2024-01-02.md',
				lineNumber: 5,
			};

			// Mock methods
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([obsidianTask]);
			mockApiClient.getTasks.mockResolvedValue([]); // No existing tasks
			mockApiClient.getDefaultListId.mockReturnValue('list-123');
			mockApiClient.createTaskWithStartDate.mockResolvedValue({
				id: 'new-msft-task-456',
				title: 'New Task [todo::xyz789]',
				status: 'notStarted',
				createdDateTime: '2024-01-02T00:00:00Z',
			});

			// Mock metadata lookup to return undefined (no existing metadata)
			mockMetadataStore.getMsftTaskId.mockReturnValue(undefined);
			
			// Create synchronizer with the mocked metadata store
			synchronizer = new TodoSynchronizer(
				mockApiClient,
				mockDailyNoteManager,
				mockLogger,
				'## TODO',
				mockPlugin
			);
			// Replace the metadata store with our mock
			(synchronizer as any).metadataStore = mockMetadataStore;

			// Execute sync
			const result = await synchronizer.syncObsidianToMsft();

			// Verify task was created
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'list-123',
				'New Task [todo::xyz789]',
				'2024-01-02'
			);
			expect(result.added).toBe(1);

			// Verify metadata was stored with cleaned title
			expect(mockMetadataStore.setMetadata).toHaveBeenCalledWith(
				'2024-01-02',
				'New Task', // Cleaned title without [todo::xyz789]
				'new-msft-task-456'
			);
		});
	});
});