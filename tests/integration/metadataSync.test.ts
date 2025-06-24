// Integration tests for metadata-based synchronization

import { Plugin } from 'obsidian';
import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { TodoApiClient } from '../../src/api/TodoApiClient';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { SimpleLogger } from '../../src/utils/simpleLogger';
import { TodoTask, DailyNoteTask } from '../../src/types';

describe('Metadata-based Synchronization Integration', () => {
	let synchronizer: TodoSynchronizer;
	let mockApiClient: jest.Mocked<TodoApiClient>;
	let mockDailyNoteManager: jest.Mocked<DailyNoteManager>;
	let mockPlugin: Plugin;
	let mockLogger: SimpleLogger;

	beforeEach(() => {
		// Setup mocks
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			setLogLevel: jest.fn()
		} as any;

		mockApiClient = {
			getTasks: jest.fn(),
			createTaskWithStartDate: jest.fn(),
			completeTask: jest.fn(),
			getDefaultListId: jest.fn().mockReturnValue('default-list'),
			updateTaskTitle: jest.fn()
		} as any;

		mockDailyNoteManager = {
			ensureTodayNoteExists: jest.fn(),
			getAllDailyNoteTasks: jest.fn(),
			addTaskToTodoSection: jest.fn(),
			updateTaskCompletion: jest.fn(),
			getNotePath: jest.fn(),
			app: {
				vault: {
					getAbstractFileByPath: jest.fn().mockReturnValue({ path: 'test.md' }),
					create: jest.fn(),
					read: jest.fn(),
					modify: jest.fn()
				}
			}
		} as any;

		mockPlugin = {
			loadData: jest.fn().mockResolvedValue({}),
			saveData: jest.fn().mockResolvedValue(undefined)
		} as any;

		synchronizer = new TodoSynchronizer(
			mockApiClient,
			mockDailyNoteManager,
			mockLogger,
			'## ToDo',
			mockPlugin
		);
	});

	describe('Microsoft to Obsidian sync with title cleaning', () => {
		it('should clean task titles and store metadata correctly', async () => {
			// Setup: Microsoft tasks with todo IDs in titles
			const msftTasks: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'Task 1 [todo::AQMkADAwATM3ZmYAZS1kMzFkLWYwZjEtMDACLTAwCgBGAAADKvJqO0p3mU-FTDGh4VbOKAcAmO8F=]',
					status: 'notStarted',
					createdDateTime: '2024-01-15T00:00:00Z'
				},
				{
					id: 'msft-2',
					title: 'Task 2 [todo::simple-id-123]',
					status: 'notStarted',
					createdDateTime: '2024-01-15T00:00:00Z'
				}
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);
			mockDailyNoteManager.getNotePath.mockReturnValue('Daily Notes/2024-01-15.md');

			// Execute sync
			const result = await synchronizer.syncMsftToObsidian();

			// Verify: Titles were cleaned in Microsoft Todo
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledWith(
				'default-list',
				'msft-1',
				'Task 1'
			);
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledWith(
				'default-list',
				'msft-2',
				'Task 2'
			);

			// Verify: Tasks added to Obsidian with clean titles
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-15.md',
				'Task 1',
				'## ToDo'
			);
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-15.md',
				'Task 2',
				'## ToDo'
			);

			// Verify: Metadata was stored
			const metadataStore = (synchronizer as any).metadataStore;
			expect(metadataStore.getMsftTaskId('2024-01-15', 'Task 1')).toBe('msft-1');
			expect(metadataStore.getMsftTaskId('2024-01-15', 'Task 2')).toBe('msft-2');

			expect(result.added).toBe(2);
			expect(result.errors).toHaveLength(0);
		});

		it('should skip duplicate tasks using metadata', async () => {
			// Setup: Pre-existing metadata
			const metadataStore = (synchronizer as any).metadataStore;
			await metadataStore.setMetadata('2024-01-15', 'Existing Task', 'msft-existing');

			const msftTasks: TodoTask[] = [
				{
					id: 'msft-existing',
					title: 'Existing Task',
					status: 'notStarted',
					createdDateTime: '2024-01-15T00:00:00Z'
				}
			];

			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Existing Task',
					completed: false,
					lineNumber: 5,
					startDate: '2024-01-15'
				}
			];

			// Mock findByMsftTaskId to return metadata
			jest.spyOn(metadataStore, 'findByMsftTaskId').mockReturnValue({
				msftTaskId: 'msft-existing',
				date: '2024-01-15',
				title: 'Existing Task',
				lastSynced: Date.now()
			});

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);

			// Execute sync
			const result = await synchronizer.syncMsftToObsidian();

			// Verify: Task was not added again
			expect(mockDailyNoteManager.addTaskToTodoSection).not.toHaveBeenCalled();
			expect(result.added).toBe(0);
		});
	});

	describe('Obsidian to Microsoft sync with metadata', () => {
		it('should create tasks in Microsoft and store metadata', async () => {
			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'New Obsidian Task',
					completed: false,
					lineNumber: 5,
					startDate: '2024-01-15',
					filePath: 'Daily Notes/2024-01-15.md'
				}
			];

			const createdTask: TodoTask = {
				id: 'msft-new',
				title: 'New Obsidian Task',
				status: 'notStarted',
				createdDateTime: '2024-01-15T00:00:00Z'
			};

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockApiClient.getTasks.mockResolvedValue([]);
			mockApiClient.createTaskWithStartDate.mockResolvedValue(createdTask);

			// Execute sync
			const result = await synchronizer.syncObsidianToMsft();

			// Verify: Task created in Microsoft
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'default-list',
				'New Obsidian Task',
				'2024-01-15'
			);

			// Verify: Metadata was stored
			const metadataStore = (synchronizer as any).metadataStore;
			expect(metadataStore.getMsftTaskId('2024-01-15', 'New Obsidian Task')).toBe('msft-new');

			expect(result.added).toBe(1);
		});

		it('should skip tasks that already have metadata', async () => {
			// Setup: Pre-existing metadata
			const metadataStore = (synchronizer as any).metadataStore;
			await metadataStore.setMetadata('2024-01-15', 'Existing Task', 'msft-existing');

			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Existing Task',
					completed: false,
					lineNumber: 5,
					startDate: '2024-01-15'
				}
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);
			mockApiClient.getTasks.mockResolvedValue([]);

			// Execute sync
			const result = await synchronizer.syncObsidianToMsft();

			// Verify: Task was not created again
			expect(mockApiClient.createTaskWithStartDate).not.toHaveBeenCalled();
			expect(result.added).toBe(0);
		});
	});

	describe('Completion sync with metadata', () => {
		it('should sync completions using metadata mapping', async () => {
			// Setup: Metadata linking tasks
			const metadataStore = (synchronizer as any).metadataStore;
			await metadataStore.setMetadata('2024-01-15', 'Task to Complete', 'msft-1');

			// Mock findByMsftTaskId to return metadata
			jest.spyOn(metadataStore, 'findByMsftTaskId').mockReturnValue({
				msftTaskId: 'msft-1',
				date: '2024-01-15',
				title: 'Task to Complete',
				lastSynced: Date.now()
			});

			const msftTasks: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'Task to Complete',
					status: 'completed',
					createdDateTime: '2024-01-15T00:00:00Z',
					completedDateTime: '2024-01-20T10:00:00Z'
				}
			];

			const dailyTasks: DailyNoteTask[] = [
				{
					title: 'Task to Complete',
					completed: false,
					lineNumber: 5,
					startDate: '2024-01-15',
					filePath: 'Daily Notes/2024-01-15.md'
				}
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(dailyTasks);

			// Execute sync
			const result = await synchronizer.syncCompletions();

			// Verify: Obsidian task was marked as completed
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'Daily Notes/2024-01-15.md',
				5,
				true,
				'2024-01-20'
			);

			expect(result.completed).toBe(1);
		});

		it('should handle task title updates in metadata', async () => {
			const metadataStore = (synchronizer as any).metadataStore;
			
			// Setup: Task with original title
			await metadataStore.setMetadata('2024-01-15', 'Original Title', 'msft-1');

			// Update title
			await metadataStore.updateTitle('2024-01-15', 'Original Title', 'Updated Title');

			// Verify: Old title no longer mapped
			expect(metadataStore.getMsftTaskId('2024-01-15', 'Original Title')).toBeUndefined();

			// Verify: New title is mapped to same ID
			expect(metadataStore.getMsftTaskId('2024-01-15', 'Updated Title')).toBe('msft-1');
		});
	});

	describe('Full sync workflow', () => {
		it('should handle complete sync cycle without todo IDs', async () => {
			// Initial state: Microsoft has tasks with todo IDs
			const msftTasksInitial: TodoTask[] = [
				{
					id: 'msft-1',
					title: 'Task 1 [todo::old-id-123]',
					status: 'notStarted',
					createdDateTime: '2024-01-15T00:00:00Z'
				}
			];

			mockApiClient.getTasks.mockResolvedValueOnce(msftTasksInitial);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValueOnce([]);
			mockDailyNoteManager.getNotePath.mockReturnValue('Daily Notes/2024-01-15.md');

			// Execute first sync (Microsoft to Obsidian)
			await synchronizer.syncMsftToObsidian();

			// Verify: Title was cleaned
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledWith(
				'default-list',
				'msft-1',
				'Task 1'
			);

			// Simulate user creating new task in Obsidian
			const obsidianTasks: DailyNoteTask[] = [
				{
					title: 'Task 1',
					completed: false,
					lineNumber: 5,
					startDate: '2024-01-15'
				},
				{
					title: 'New Task from Obsidian',
					completed: false,
					lineNumber: 6,
					startDate: '2024-01-15'
				}
			];

			// Setup for second sync - existing Microsoft tasks and new Obsidian task
			mockApiClient.getTasks.mockResolvedValue([
				{
					id: 'msft-1',
					title: 'Task 1', // Clean title
					status: 'notStarted',
					createdDateTime: '2024-01-15T00:00:00Z'
				}
			]);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);
			
			// Mock createTaskWithStartDate to return created task
			mockApiClient.createTaskWithStartDate.mockResolvedValue({
				id: 'msft-new',
				title: 'New Task from Obsidian',
				status: 'notStarted',
				createdDateTime: '2024-01-15T00:00:00Z'
			});

			// Execute Obsidian to Microsoft sync
			await synchronizer.syncObsidianToMsft();

			// Verify: Only new task was synced to Microsoft
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'default-list',
				'New Task from Obsidian',
				'2024-01-15'
			);

			// Verify: No duplicate tasks were created in second sync
			// (The first sync would have called addTaskToTodoSection)
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledTimes(1);
		});
	});
});