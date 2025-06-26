import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { TodoApiClient } from '../../src/api/TodoApiClient';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { TaskMetadataStore } from '../../src/sync/TaskMetadataStore';
import { DailyNoteTask } from '../../src/types';

jest.mock('../../src/api/TodoApiClient');
jest.mock('../../src/sync/DailyNoteManager');

describe('TodoSynchronizer - 内部同期', () => {
	let synchronizer: TodoSynchronizer;
	let mockApiClient: jest.Mocked<TodoApiClient>;
	let mockDailyNoteManager: jest.Mocked<DailyNoteManager>;
	let mockMetadataStore: TaskMetadataStore;
	let mockLogger: any;

	beforeEach(() => {
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
		};

		mockApiClient = {
			getTasks: jest.fn(),
			createTask: jest.fn(),
			completeTask: jest.fn(),
			getDefaultListId: jest.fn(),
		} as any;

		mockDailyNoteManager = {
			ensureTodayNoteExists: jest.fn(),
			getDailyNoteTasks: jest.fn(),
			addTaskToTodoSection: jest.fn(),
			updateTaskCompletion: jest.fn(),
			getTodayNotePath: jest.fn(),
			getDailyNoteFiles: jest.fn(),
			app: {
				vault: {
					getAbstractFileByPath: jest.fn().mockReturnValue(null),
					create: jest.fn().mockResolvedValue(undefined),
					read: jest.fn().mockResolvedValue(''),
					modify: jest.fn().mockResolvedValue(undefined),
				}
			}
		} as any;

		const mockPlugin = {
			loadData: jest.fn().mockResolvedValue({}),
			saveData: jest.fn().mockResolvedValue(undefined)
		} as any;

		synchronizer = new TodoSynchronizer(
			mockApiClient,
			mockDailyNoteManager,
			mockLogger,
			mockPlugin,
			'## Todo'
		);

		// Access the private metadata store for testing
		mockMetadataStore = (synchronizer as any).metadataStore;
	});

	describe('reconcileMetadataWithDailyNotes', () => {
		it('should update metadata when task title is changed in daily note', async () => {
			// Setup: Add metadata for an existing task
			await mockMetadataStore.setMetadata('2025-06-26', 'Buy groceries', 'msft-task-123');

			// Mock daily note tasks with changed title
			const dailyNoteTasks: DailyNoteTask[] = [{
				title: 'Buy groceries and milk',  // Changed title
				completed: false,
				lineNumber: 5,
				startDate: '2025-06-26',
				filePath: 'Daily Notes/2025-06-26.md'
			}];

			mockDailyNoteManager.getDailyNoteFiles.mockResolvedValue([{
				path: 'Daily Notes/2025-06-26.md',
				basename: '2025-06-26'
			} as any]);
			mockDailyNoteManager.getDailyNoteTasks.mockResolvedValue(dailyNoteTasks);

			// 内部同期を実行
			await (synchronizer as any).reconcileMetadataWithDailyNotes();

			// Verify: Old metadata should be removed, new one added
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Buy groceries')).toBeUndefined();
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Buy groceries and milk')).toBe('msft-task-123');
		});

		it('should remove metadata when task is deleted from daily note', async () => {
			// Setup: Add metadata for tasks
			await mockMetadataStore.setMetadata('2025-06-26', 'Task 1', 'msft-task-1');
			await mockMetadataStore.setMetadata('2025-06-26', 'Task 2', 'msft-task-2');
			await mockMetadataStore.setMetadata('2025-06-26', 'Task 3', 'msft-task-3');

			// Mock daily note with only Task 1 and Task 3 (Task 2 was deleted)
			const dailyNoteTasks: DailyNoteTask[] = [
				{
					title: 'Task 1',
					completed: false,
					lineNumber: 5,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				},
				{
					title: 'Task 3',
					completed: false,
					lineNumber: 7,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				}
			];

			mockDailyNoteManager.getDailyNoteFiles.mockResolvedValue([{
				path: 'Daily Notes/2025-06-26.md',
				basename: '2025-06-26'
			} as any]);
			mockDailyNoteManager.getDailyNoteTasks.mockResolvedValue(dailyNoteTasks);

			// 内部同期を実行
			await (synchronizer as any).reconcileMetadataWithDailyNotes();

			// Verify: Task 2 metadata should be removed
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Task 1')).toBe('msft-task-1');
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Task 2')).toBeUndefined();
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Task 3')).toBe('msft-task-3');
		});

		it('should handle multiple title changes based on position', async () => {
			// Setup: Add metadata for tasks in order
			await mockMetadataStore.setMetadata('2025-06-26', 'Morning task', 'msft-task-1');
			await mockMetadataStore.setMetadata('2025-06-26', 'Afternoon task', 'msft-task-2');
			await mockMetadataStore.setMetadata('2025-06-26', 'Evening task', 'msft-task-3');

			// Mock daily note with all titles changed but same order
			const dailyNoteTasks: DailyNoteTask[] = [
				{
					title: 'Morning workout',  // Changed from "Morning task"
					completed: false,
					lineNumber: 5,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				},
				{
					title: 'Lunch meeting',    // Changed from "Afternoon task"
					completed: false,
					lineNumber: 6,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				},
				{
					title: 'Dinner prep',      // Changed from "Evening task"
					completed: false,
					lineNumber: 7,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				}
			];

			mockDailyNoteManager.getDailyNoteFiles.mockResolvedValue([{
				path: 'Daily Notes/2025-06-26.md',
				basename: '2025-06-26'
			} as any]);
			mockDailyNoteManager.getDailyNoteTasks.mockResolvedValue(dailyNoteTasks);

			// 内部同期を実行
			await (synchronizer as any).reconcileMetadataWithDailyNotes();

			// Verify: Metadata should be updated based on position
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Morning workout')).toBe('msft-task-1');
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Lunch meeting')).toBe('msft-task-2');
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Dinner prep')).toBe('msft-task-3');

			// Old titles should not have metadata
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Morning task')).toBeUndefined();
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Afternoon task')).toBeUndefined();
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Evening task')).toBeUndefined();
		});

		it('should preserve metadata for unchanged tasks', async () => {
			// Setup: Add metadata
			await mockMetadataStore.setMetadata('2025-06-26', 'Keep this task', 'msft-task-1');
			await mockMetadataStore.setMetadata('2025-06-26', 'Change this task', 'msft-task-2');

			// Mock daily note with one changed, one unchanged
			const dailyNoteTasks: DailyNoteTask[] = [
				{
					title: 'Keep this task',     // Unchanged
					completed: false,
					lineNumber: 5,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				},
				{
					title: 'Modified task',       // Changed from "Change this task"
					completed: false,
					lineNumber: 6,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				}
			];

			mockDailyNoteManager.getDailyNoteFiles.mockResolvedValue([{
				path: 'Daily Notes/2025-06-26.md',
				basename: '2025-06-26'
			} as any]);
			mockDailyNoteManager.getDailyNoteTasks.mockResolvedValue(dailyNoteTasks);

			// 内部同期を実行
			await (synchronizer as any).reconcileMetadataWithDailyNotes();

			// Verify: Unchanged task keeps metadata, changed task gets updated
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Keep this task')).toBe('msft-task-1');
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Modified task')).toBe('msft-task-2');
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Change this task')).toBeUndefined();
		});

		it('should handle partial title matches when detecting changes', async () => {
			// Setup: Add metadata
			await mockMetadataStore.setMetadata('2025-06-26', 'Buy milk', 'msft-task-1');
			await mockMetadataStore.setMetadata('2025-06-26', 'Call John', 'msft-task-2');

			// Mock daily note with extended titles
			const dailyNoteTasks: DailyNoteTask[] = [
				{
					title: 'Buy milk and bread',  // Extended version of "Buy milk"
					completed: false,
					lineNumber: 5,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				},
				{
					title: 'Call John about project',  // Extended version of "Call John"
					completed: false,
					lineNumber: 6,
					startDate: '2025-06-26',
					filePath: 'Daily Notes/2025-06-26.md'
				}
			];

			mockDailyNoteManager.getDailyNoteFiles.mockResolvedValue([{
				path: 'Daily Notes/2025-06-26.md',
				basename: '2025-06-26'
			} as any]);
			mockDailyNoteManager.getDailyNoteTasks.mockResolvedValue(dailyNoteTasks);

			// 内部同期を実行
			await (synchronizer as any).reconcileMetadataWithDailyNotes();

			// Verify: Metadata should be updated for partial matches
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Buy milk and bread')).toBe('msft-task-1');
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Call John about project')).toBe('msft-task-2');
		});

		it('should skip reconciliation for notes without the task section', async () => {
			// Setup: Add metadata
			await mockMetadataStore.setMetadata('2025-06-26', 'Task in wrong section', 'msft-task-1');

			// Mock daily note returns empty array (no tasks in the Todo section)
			mockDailyNoteManager.getDailyNoteFiles.mockResolvedValue([{
				path: 'Daily Notes/2025-06-26.md',
				basename: '2025-06-26'
			} as any]);
			mockDailyNoteManager.getDailyNoteTasks.mockResolvedValue([]);

			// 内部同期を実行
			await (synchronizer as any).reconcileMetadataWithDailyNotes();

			// Verify: Metadata should be removed since task is not in Todo section
			expect(mockMetadataStore.getMsftTaskId('2025-06-26', 'Task in wrong section')).toBeUndefined();
		});
	});

	describe('performFullSync with internal sync', () => {
		it('他の同期操作の前にreconcileMetadataWithDailyNotesを呼び出す', async () => {
			const callOrder: string[] = [];

			// Mock the internal sync method
			const reconcileSpy = jest.spyOn(synchronizer as any, 'reconcileMetadataWithDailyNotes')
				.mockImplementation(async () => {
					callOrder.push('reconcile');
				});

			// Mock other sync methods
			const syncMsftSpy = jest.spyOn(synchronizer as any, 'syncMsftToObsidian')
				.mockImplementation(async () => {
					callOrder.push('syncMsft');
					return { added: 0, errors: [] };
				});
			const syncObsidianSpy = jest.spyOn(synchronizer as any, 'syncObsidianToMsft')
				.mockImplementation(async () => {
					callOrder.push('syncObsidian');
					return { added: 0, errors: [] };
				});
			const syncCompletionsSpy = jest.spyOn(synchronizer as any, 'syncCompletions')
				.mockImplementation(async () => {
					callOrder.push('syncCompletions');
					return { completed: 0, errors: [] };
				});

			mockDailyNoteManager.ensureTodayNoteExists.mockResolvedValue('Daily Notes/2025-06-26.md');

			// Execute full sync
			await synchronizer.performFullSync();

			// Verify: Internal sync should be called first
			expect(callOrder).toEqual(['reconcile', 'syncMsft', 'syncObsidian', 'syncCompletions']);
			expect(reconcileSpy).toHaveBeenCalledTimes(1);
			expect(syncMsftSpy).toHaveBeenCalledTimes(1);
			expect(syncObsidianSpy).toHaveBeenCalledTimes(1);
			expect(syncCompletionsSpy).toHaveBeenCalledTimes(1);
		});
	});
});