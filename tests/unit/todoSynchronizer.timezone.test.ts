import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { TodoApiClient } from '../../src/api/TodoApiClient';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { SimpleLogger } from '../../src/utils/simpleLogger';

jest.mock('../../src/api/TodoApiClient');
jest.mock('../../src/sync/DailyNoteManager');

describe('TodoSynchronizer - タイムゾーン処理', () => {
	// 元のDate関数を保存
	const OriginalDate = Date;
	let synchronizer: TodoSynchronizer;
	let mockApiClient: jest.Mocked<TodoApiClient>;
	let mockDailyNoteManager: jest.Mocked<DailyNoteManager>;
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
			getDefaultListId: jest.fn().mockReturnValue('default-list-id'),
			updateTaskTitle: jest.fn(),
		} as any;

		mockDailyNoteManager = {
			ensureTodayNoteExists: jest.fn(),
			getDailyNoteTasks: jest.fn(),
			addTaskToTodoSection: jest.fn(),
			updateTaskCompletion: jest.fn(),
			getNotePath: jest.fn().mockImplementation(date => `Daily Notes/${date}.md`),
			createDailyNote: jest.fn(),
			getAllDailyNoteTasks: jest.fn(),
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
			'## TODO'
		);
	});

	describe('期日のタイムゾーン変換', () => {
		it('UTC時間で期日が設定されたタスクを正しい日付のデイリーノートに追加する', async () => {
			// Microsoft TodoのタスクでUTC 15:00（日本時間翌日0:00）の期日
			const msftTask = {
				id: 'msft-123',
				title: '明日が期日のタスク',
				status: 'notStarted' as const,
				createdDateTime: '2024-01-01T00:00:00Z',
				dueDateTime: {
					dateTime: '2024-01-02T15:00:00.0000000',
					timeZone: 'UTC'
				}
			};

			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);

			await synchronizer.syncMsftToObsidian();

			// ローカルタイムゾーンに応じて期待値を設定
			// テスト環境のタイムゾーンにより結果が異なる
			const addTaskCall = mockDailyNoteManager.addTaskToTodoSection.mock.calls[0];
			expect(addTaskCall).toBeDefined();
			expect(addTaskCall[1]).toBe('明日が期日のタスク');
			expect(addTaskCall[2]).toBe('## TODO');
			
			// 日付部分のみを検証（タイムゾーンによって2024-01-02または2024-01-03）
			const notePath = addTaskCall[0];
			expect(notePath).toMatch(/Daily Notes\/2024-01-0[23]\.md/);
		});

		it('JST(UTC+9)環境で期日が2025-06-30のタスクは2025-06-30のデイリーノートに追加される', async () => {
			// JSTタイムゾーンをモック（UTC+9）
			const mockDate = jest.spyOn(global, 'Date').mockImplementation((dateStr?: any) => {
				if (dateStr) {
					const date = new OriginalDate(dateStr);
					// getFullYear等のメソッドをJSTとして動作させる
					date.getFullYear = jest.fn(() => {
						const jstDate = new OriginalDate(date.getTime() + 9 * 60 * 60 * 1000);
						return jstDate.getUTCFullYear();
					});
					date.getMonth = jest.fn(() => {
						const jstDate = new OriginalDate(date.getTime() + 9 * 60 * 60 * 1000);
						return jstDate.getUTCMonth();
					});
					date.getDate = jest.fn(() => {
						const jstDate = new OriginalDate(date.getTime() + 9 * 60 * 60 * 1000);
						return jstDate.getUTCDate();
					});
					date.getTimezoneOffset = jest.fn(() => -540); // JST = UTC+9
					return date as any;
				}
				return new OriginalDate() as any;
			}) as any;

			// Microsoft TodoのタスクでUTC 2025-06-29T15:00の期日（JST 2025-06-30T00:00）
			const msftTask = {
				id: 'msft-test-20250630',
				title: 'テストタスク_mstd_to_obs_due20250630',
				status: 'notStarted' as const,
				createdDateTime: '2025-06-26T00:00:00Z',
				dueDateTime: {
					dateTime: '2025-06-29T15:00:00.0000000',
					timeZone: 'UTC'
				}
			};

			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);

			await synchronizer.syncMsftToObsidian();

			// JSTで2025-06-30として処理される
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2025-06-30.md',
				'テストタスク_mstd_to_obs_due20250630',
				'## TODO'
			);

			mockDate.mockRestore();
		});

		it('PST(UTC-8)環境で期日が2025-06-30のタスクは2025-06-30のデイリーノートに追加される', async () => {
			// PSTタイムゾーンをモック（UTC-8）
			const mockDate = jest.spyOn(global, 'Date').mockImplementation((dateStr?: any) => {
				if (dateStr) {
					const date = new OriginalDate(dateStr);
					// getFullYear等のメソッドをPSTとして動作させる
					date.getFullYear = jest.fn(() => {
						const pstDate = new OriginalDate(date.getTime() - 8 * 60 * 60 * 1000);
						return pstDate.getUTCFullYear();
					});
					date.getMonth = jest.fn(() => {
						const pstDate = new OriginalDate(date.getTime() - 8 * 60 * 60 * 1000);
						return pstDate.getUTCMonth();
					});
					date.getDate = jest.fn(() => {
						const pstDate = new OriginalDate(date.getTime() - 8 * 60 * 60 * 1000);
						return pstDate.getUTCDate();
					});
					date.getTimezoneOffset = jest.fn(() => 480); // PST = UTC-8
					return date as any;
				}
				return new OriginalDate() as any;
			}) as any;

			// Microsoft TodoのタスクでUTC 2025-06-30T08:00の期日（PST 2025-06-30T00:00）
			const msftTask = {
				id: 'msft-test-20250630-pst',
				title: 'テストタスク_PST',
				status: 'notStarted' as const,
				createdDateTime: '2025-06-26T00:00:00Z',
				dueDateTime: {
					dateTime: '2025-06-30T08:00:00.0000000',
					timeZone: 'UTC'
				}
			};

			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);

			await synchronizer.syncMsftToObsidian();

			// PSTで2025-06-30として処理される
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2025-06-30.md',
				'テストタスク_PST',
				'## TODO'
			);

			mockDate.mockRestore();
		});

		it('期日がない場合は作成日を使用する', async () => {
			const msftTask = {
				id: 'msft-456',
				title: '期日なしタスク',
				status: 'notStarted' as const,
				createdDateTime: '2024-01-05T10:30:00Z',
				dueDateTime: undefined
			};

			mockApiClient.getTasks.mockResolvedValue([msftTask]);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);

			await synchronizer.syncMsftToObsidian();

			// 作成日（UTC）をそのまま日付として使用
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-05.md',
				'期日なしタスク',
				'## TODO'
			);
		});
	});
});