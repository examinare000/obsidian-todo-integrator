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

	describe('タスク完了状態の双方向同期 - 異なるフォーマットのタスクでも同期される', () => {
		let mockMetadataStore: any;

		beforeEach(() => {
			// モックメタデータストアをセットアップ
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

		it('Obsidianで内部ID付きタスクを完了にするとMicrosoft To-Doでも完了になる', async () => {
			// ビジネスシナリオ: 
			// ユーザーがObsidianでタスクに[todo::abc123]のような内部管理IDを付けて管理している
			// このIDはObsidian内でのタスク追跡用で、Microsoft To-Do側には表示されない
			// ユーザーがObsidianでタスクを完了にした時、Microsoft To-Do側でも完了状態になることを期待する
			
			// Given: Obsidianに内部ID付きの完了済みタスク
			const obsidianTask = {
				title: '買い物リスト [todo::abc123]',  // 内部IDを含むタスクタイトル
				completed: true,
				startDate: '2024-01-01',
				filePath: 'daily/2024-01-01.md',
				lineNumber: 10,
			};

			// And: Microsoft To-Doに対応するタスク（IDなし）
			const msftTask: TodoTask = {
				id: 'msft-task-123',
				title: '買い物リスト',  // Microsoft側にはIDが表示されない
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			// モックメソッドの設定
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([obsidianTask]);
			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockApiClient.getDefaultListId.mockReturnValue('list-123');

			// And: メタデータストアがIDなしのタイトルでタスクを管理している
			mockMetadataStore.getMsftTaskId.mockReturnValue('msft-task-123');
			
			// When: 完了状態を同期する
			synchronizer = new TodoSynchronizer(
				mockApiClient,
				mockDailyNoteManager,
				mockLogger,
				'## TODO',
				mockPlugin
			);
			(synchronizer as any).metadataStore = mockMetadataStore;

			const result = await synchronizer.syncCompletions();

			// Then: Microsoft To-Do側でもタスクが完了になる
			expect(mockApiClient.completeTask).toHaveBeenCalledWith('list-123', 'msft-task-123');
			expect(result.completed).toBe(1);
		});

		it('Microsoft To-Doで完了にしたタスクがObsidianでも完了になる（内部ID付きでも）', async () => {
			// ビジネスシナリオ:
			// ユーザーがMicrosoft To-Doアプリでタスクを完了にした
			// Obsidian側では同じタスクに内部管理IDが付いているが、それでも正しく完了状態が反映されることを期待する
			
			// Given: Microsoft To-Doで完了済みのタスク
			const msftTask: TodoTask = {
				id: 'msft-task-123',
				title: 'プロジェクト企画書作成',
				status: 'completed',
				completedDateTime: '2024-01-01T10:00:00Z',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			// And: Obsidianに対応する未完了タスク（内部ID付き）
			const obsidianTask = {
				title: 'プロジェクト企画書作成 [todo::proj-001]',
				completed: false,
				startDate: '2024-01-01',
				filePath: 'daily/2024-01-01.md',
				lineNumber: 10,
			};

			// モックメソッドの設定
			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([obsidianTask]);
			mockDailyNoteManager.updateTaskCompletion.mockResolvedValue();

			// And: メタデータストアがIDなしのタイトルでタスクを管理している
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'msft-task-123',
				date: '2024-01-01',
				title: 'プロジェクト企画書作成', // IDなしのクリーンなタイトル
				lastSynced: Date.now(),
			});
			
			// When: 完了状態を同期する
			synchronizer = new TodoSynchronizer(
				mockApiClient,
				mockDailyNoteManager,
				mockLogger,
				'## TODO',
				mockPlugin
			);
			(synchronizer as any).metadataStore = mockMetadataStore;

			const result = await synchronizer.syncCompletions();

			// Then: Obsidian側でもタスクが完了になる
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'daily/2024-01-01.md',
				10,
				true,
				'2024-01-01'
			);
			expect(result.completed).toBe(1);
		});

		it('新規タスク作成時は内部IDを除外してメタデータに保存される', async () => {
			// ビジネスシナリオ:
			// ユーザーがObsidianで新しいタスクを作成し、内部管理用のIDを付けた
			// このタスクがMicrosoft To-Doに同期される際、メタデータは正しく管理される必要がある
			// 将来の完了状態同期のため、IDなしのクリーンなタイトルでメタデータを保存する
			
			// Given: Obsidianに内部ID付きの新規タスク
			const obsidianTask = {
				title: '週次レポート作成 [todo::weekly-report-2024]',
				completed: false,
				startDate: '2024-01-02',
				filePath: 'daily/2024-01-02.md',
				lineNumber: 5,
			};

			// And: Microsoft To-Doには既存タスクがない
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([obsidianTask]);
			mockApiClient.getTasks.mockResolvedValue([]);
			mockApiClient.getDefaultListId.mockReturnValue('list-123');
			mockApiClient.createTaskWithStartDate.mockResolvedValue({
				id: 'new-msft-task-456',
				title: '週次レポート作成 [todo::weekly-report-2024]',
				status: 'notStarted',
				createdDateTime: '2024-01-02T00:00:00Z',
			});

			// And: メタデータストアには既存の情報がない
			mockMetadataStore.getMsftTaskId.mockReturnValue(undefined);
			
			// When: タスクを同期する
			synchronizer = new TodoSynchronizer(
				mockApiClient,
				mockDailyNoteManager,
				mockLogger,
				'## TODO',
				mockPlugin
			);
			(synchronizer as any).metadataStore = mockMetadataStore;

			const result = await synchronizer.syncObsidianToMsft();

			// Then: Microsoft To-Doにタスクが作成される（IDも含めて）
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'list-123',
				'週次レポート作成 [todo::weekly-report-2024]',  // フルタイトルで作成
				'2024-01-02'
			);
			expect(result.added).toBe(1);

			// And: メタデータはIDなしのクリーンなタイトルで保存される
			expect(mockMetadataStore.setMetadata).toHaveBeenCalledWith(
				'2024-01-02',
				'週次レポート作成',  // 内部IDを除外したタイトル
				'new-msft-task-456'
			);
		});
	});
});