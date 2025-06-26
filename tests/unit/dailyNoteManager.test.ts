/**
 * DailyNoteManagerのテストスイート
 * デイリーノートの作成、タスクの追加・更新・取得機能をテスト
 */

import { App, TFile } from 'obsidian';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { DailyNoteTask } from '../../src/types';
import { createMockLogger } from '../__mocks__/mockFactories';

describe('DailyNoteManager', () => {
	let manager: DailyNoteManager;
	let mockApp: App;
	let mockLogger: ReturnType<typeof createMockLogger>;

	beforeEach(() => {
		// モックの初期化
		mockApp = new App();
		mockLogger = createMockLogger();
		manager = new DailyNoteManager(mockApp, mockLogger, 'Daily Notes');
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('今日のノートパス取得（getTodayNotePath）', () => {
		it('今日の日付で正しいパスを生成する', () => {
			// Given: 現在の日付
			const today = new Date();
			const expectedDate = today.toISOString().slice(0, 10);
			
			// When: 今日のノートパスを取得
			const path = manager.getTodayNotePath();
			
			// Then: 正しいパスが返される
			expect(path).toBe(`Daily Notes/${expectedDate}.md`);
		});

		it('カスタムデイリーノートパスを使用する', () => {
			// Given: カスタムパスを持つマネージャー
			const customManager = new DailyNoteManager(mockApp, mockLogger, 'Journal');
			const today = new Date();
			const expectedDate = today.toISOString().slice(0, 10);
			
			// When: 今日のノートパスを取得
			const path = customManager.getTodayNotePath();
			
			// Then: カスタムパスが使用される
			expect(path).toBe(`Journal/${expectedDate}.md`);
		});
	});

	describe('今日のノート存在確認（ensureTodayNoteExists）', () => {
		it('既存のノートがある場合はそのパスを返す', async () => {
			// Given: 既存のデイリーノート
			const todayPath = manager.getTodayNotePath();
			const mockFile = new TFile();
			mockFile.path = todayPath;
			mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFile);

			// When: ノートの存在を確認
			const result = await manager.ensureTodayNoteExists();

			// Then: 既存のパスが返される
			expect(result).toBe(todayPath);
			expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith(todayPath);
		});

		it('ノートが存在しない場合は新規作成する', async () => {
			// Given: デイリーノートが存在しない
			const todayPath = manager.getTodayNotePath();
			const mockFile = new TFile();
			mockFile.path = todayPath;
			mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);
			mockApp.vault.create = jest.fn().mockResolvedValue(mockFile);

			// When: ノートの存在を確認
			const result = await manager.ensureTodayNoteExists();

			// Then: 新規ノートが作成される
			expect(result).toBe(todayPath);
			expect(mockApp.vault.create).toHaveBeenCalledWith(
				todayPath,
				expect.stringContaining('# Daily Note')
			);
		});
	});

	describe('ToDoセクションの検索または作成（findOrCreateTodoSection）', () => {
		it('既存のToDoセクションを見つける', async () => {
			// Given: ToDoセクションを含むファイル
			const fileContent = `# Daily Note

## ToDo
- [ ] Task 1
- [x] Task 2

## Notes
Some notes here.`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			// When: ToDoセクションを検索
			const sectionLine = await manager.findOrCreateTodoSection('test.md');

			// Then: 正しい行番号が返される（0-indexed）
			expect(sectionLine).toBe(2);
		});

		it('ToDoセクションが存在しない場合は作成する', async () => {
			// Given: ToDoセクションがないファイル
			const fileContent = `# Daily Note

## Notes
Some notes here.`;

			const expectedContent = `# Daily Note

## ToDo

## Notes
Some notes here.`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			// When: ToDoセクションを検索
			const sectionLine = await manager.findOrCreateTodoSection('test.md');

			// Then: 新しいセクションが作成される
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
			expect(sectionLine).toBe(2);
		});
	});

	describe('ToDoセクションへのタスク追加（addTaskToTodoSection）', () => {
		it('既存のタスクリストに新しいタスクを追加する', async () => {
			// Given: 既存のタスクを含むファイル
			const fileContent = `# Daily Note

## ToDo
- [ ] Existing task

## Notes`;

			const expectedContent = `# Daily Note

## ToDo
- [ ] Existing task
- [ ] New task

## Notes`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			// When: 新しいタスクを追加
			await manager.addTaskToTodoSection('test.md', 'New task');

			// Then: タスクがリストの最後に追加される
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});

		it('空のToDoセクションにタスクを追加する', async () => {
			// Given: 空のToDoセクション
			const fileContent = `# Daily Note

## ToDo

## Notes`;

			const expectedContent = `# Daily Note

## ToDo
- [ ] Simple task

## Notes`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			// When: タスクを追加
			await manager.addTaskToTodoSection('test.md', 'Simple task');

			// Then: タスクが正しく追加される
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});
	});

	describe('デイリーノートからのタスク取得（getDailyNoteTasks）', () => {
		it('デイリーノートからタスクを正しく解析する', async () => {
			// Given: 複数のタスクを含むデイリーノート
			const fileContent = `# Daily Note

## ToDo
- [ ] Task 1
- [x] Task 2 ✅ 2024-01-15
- [ ] Task 3

## Notes`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			// When: タスクを取得
			const tasks = await manager.getDailyNoteTasks('test.md');

			// Then: すべてのタスクが正しく解析される
			expect(tasks).toHaveLength(3);
			
			// 未完了タスク
			expect(tasks[0]).toEqual({
				title: 'Task 1',
				completed: false,
				lineNumber: 3,
				completionDate: undefined,
				startDate: undefined,
				filePath: 'test.md',
			});

			// 完了済みタスク（日付付き）
			expect(tasks[1]).toEqual({
				title: 'Task 2',
				completed: true,
				lineNumber: 4,
				completionDate: '2024-01-15',
				startDate: undefined,
				filePath: 'test.md',
			});

			// 別の未完了タスク
			expect(tasks[2]).toEqual({
				title: 'Task 3',
				completed: false,
				lineNumber: 5,
				completionDate: undefined,
				startDate: undefined,
				filePath: 'test.md',
			});
		});

		it('タスクが見つからない場合は空の配列を返す', async () => {
			// Given: タスクを含まないファイル
			const fileContent = `# Daily Note

## Notes
No tasks here.`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			// When: タスクを取得
			const tasks = await manager.getDailyNoteTasks('test.md');

			// Then: 空の配列が返される
			expect(tasks).toHaveLength(0);
		});
	});

	describe('タスクの完了状態更新（updateTaskCompletion）', () => {
		it('タスクを完了済みにマークし、完了日を追加する', async () => {
			// Given: 未完了のタスク
			const fileContent = `# Daily Note

## ToDo
- [ ] Task 1
- [ ] Task 2`;

			const expectedContent = `# Daily Note

## ToDo
- [x] Task 1 ✅ 2024-01-15
- [ ] Task 2`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			// When: タスクを完了にする
			await manager.updateTaskCompletion('test.md', 3, true, '2024-01-15');

			// Then: タスクが完了済みになり、日付が追加される
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});

		it('タスクを未完了にマークする', async () => {
			// Given: 完了済みのタスク
			const fileContent = `# Daily Note

## ToDo
- [x] Task 1 ✅ 2024-01-15
- [ ] Task 2`;

			const expectedContent = `# Daily Note

## ToDo
- [ ] Task 1
- [ ] Task 2`;
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			// When: タスクを未完了にする
			await manager.updateTaskCompletion('test.md', 3, false);

			// Then: タスクが未完了になり、完了日が削除される
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});
	});

	describe('日付からノートパス生成（getNotePath）', () => {
		it('有効な日付で正しいパスを生成する', () => {
			// Given: 有効な日付文字列
			const date = '2024-01-15';
			
			// When: ノートパスを生成
			const path = manager.getNotePath(date);
			
			// Then: 正しいパスが返される
			expect(path).toBe('Daily Notes/2024-01-15.md');
		});

		it('無効な日付フォーマットでエラーをスローする', () => {
			// Given: 無効な日付フォーマット
			const invalidDate = 'invalid-date-format';
			
			// When/Then: エラーがスローされる
			expect(() => manager.getNotePath(invalidDate)).toThrow('Invalid date: invalid-date-format');
			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to get note path',
				expect.objectContaining({
					date: invalidDate,
					error: 'Invalid date: invalid-date-format'
				})
			);
		});

		it('空文字列の日付でエラーをスローする', () => {
			// Given: 空文字列
			const emptyDate = '';
			
			// When/Then: エラーがスローされる
			expect(() => manager.getNotePath(emptyDate)).toThrow('Invalid date: ');
			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to get note path',
				expect.objectContaining({
					date: emptyDate,
					error: 'Invalid date: '
				})
			);
		});

		it('null文字列の日付でエラーをスローする', () => {
			// Given: 'null'という文字列
			const nullDate = 'null';
			
			// When/Then: エラーがスローされる
			expect(() => manager.getNotePath(nullDate)).toThrow('Invalid date: null');
			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to get note path',
				expect.objectContaining({
					date: nullDate,
					error: 'Invalid date: null'
				})
			);
		});
	});
});