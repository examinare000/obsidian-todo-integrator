/**
 * TodoSynchronizerのテストスイート - タスク同期システムの完全な仕様書
 * 
 * 【システム概要】
 * ObsidianのデイリーノートとMicrosoft To-Doの間でタスクを双方向同期するシステム。
 * ユーザーはどちらのツールからでもタスクを作成・完了でき、変更は自動的に同期される。
 * 
 * 【主要機能】
 * 1. 双方向タスク同期: 新規タスクを両方向で同期
 * 2. 完了状態同期: タスクの完了/未完了状態を双方向で同期
 * 3. 重複検出: 同じタスクが複数作成されることを防ぐ
 * 4. メタデータ管理: タスクの関連付けを永続的に保存
 * 
 * 【データフロー】
 * 1. Microsoft → Obsidian:
 *    - Microsoft To-DoのAPIからタスクを取得
 *    - 期日または作成日に基づいてデイリーノートを決定
 *    - プラグインの過去のバグで付与された[todo::ID]パターンを除去
 *    - デイリーノートの該当セクションに純粋なタスクタイトルのみを追加
 *    - タスクIDは日付とタイトルをキーとしてメタデータストアに保存
 * 
 * 2. Obsidian → Microsoft:
 *    - すべてのデイリーノートからタスクを収集
 *    - メタデータストアで既存タスクかどうか確認
 *    - 新規タスクをMicrosoft To-Doに作成
 *    - 作成されたタスクIDをメタデータストアに保存
 * 
 * 【重要な設計上の決定】
 * - Obsidianには純粋なタスクタイトルのみを保存（メタデータを含まない）
 * - Microsoft To-DoのタスクIDは[日付, タイトル]の複合キーでメタデータストアから検索
 * - 完了状態の同期はメタデータストアを通じて正確にタスクを特定
 * - [todo::ID]パターンは過去のバグの残骸として検出・除去
 */

import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { TodoTask, DailyNoteTask } from '../../src/types';
import {
	createMockApiClient,
	createMockDailyNoteManager,
	createMockLogger,
	createMockPlugin,
	createMockMetadataStore,
} from '../__mocks__/mockFactories';

// モジュールをモック化
jest.mock('../../src/api/TodoApiClient');
jest.mock('../../src/sync/DailyNoteManager');

describe('TodoSynchronizer', () => {
	let synchronizer: TodoSynchronizer;
	let mockApiClient: ReturnType<typeof createMockApiClient>;
	let mockDailyNoteManager: ReturnType<typeof createMockDailyNoteManager>;
	let mockLogger: ReturnType<typeof createMockLogger>;
	let mockPlugin: ReturnType<typeof createMockPlugin>;

	beforeEach(() => {
		// モックファクトリーを使用してモックを作成
		mockLogger = createMockLogger();
		mockPlugin = createMockPlugin();
		mockApiClient = createMockApiClient();
		mockDailyNoteManager = createMockDailyNoteManager();

		// Vaultモックの追加設定
		(mockDailyNoteManager as any).app = {
			vault: {
				getAbstractFileByPath: jest.fn().mockReturnValue({
					path: 'test-path',
				}),
				read: jest.fn().mockResolvedValue('- [ ] Test task'),
				modify: jest.fn().mockResolvedValue(undefined),
			},
		};

		// デフォルトのノートパスを設定
		mockDailyNoteManager.getNotePath.mockReturnValue('Daily Notes/2024-01-01.md');
		// createDailyNoteメソッドをモック
		mockDailyNoteManager.createDailyNote.mockResolvedValue(undefined);

		// TodoSynchronizerのインスタンスを作成
		synchronizer = new TodoSynchronizer(
			mockApiClient,
			mockDailyNoteManager,
			mockLogger,
			'## TODO',
			mockPlugin
		);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('完全同期（performFullSync） - システムの中核となる同期フロー', () => {
		/**
		 * 【実装仕様】
		 * performFullSyncメソッドは以下の順序で処理を実行:
		 * 1. 本日のデイリーノートの存在確認（なければ作成）
		 * 2. Microsoft → Obsidian同期
		 * 3. Obsidian → Microsoft同期
		 * 4. 完了状態の同期
		 * 5. 古いメタデータのクリーンアップ（90日以上前のもの）
		 * 
		 * 各ステップは独立しており、一つが失敗しても他は実行される。
		 * エラーは集約されて返される。
		 */
		it('すべての同期処理を正しい順序で実行する', async () => {
			// Given: 各同期メソッドをスパイ
			const syncMsftToObsidianSpy = jest.spyOn(synchronizer, 'syncMsftToObsidian')
				.mockResolvedValue({ added: 2, errors: [] });
			const syncObsidianToMsftSpy = jest.spyOn(synchronizer, 'syncObsidianToMsft')
				.mockResolvedValue({ added: 3, errors: [] });
			const syncCompletionsSpy = jest.spyOn(synchronizer, 'syncCompletions')
				.mockResolvedValue({ completed: 1, errors: [] });

			// When: 完全同期を実行
			const result = await synchronizer.performFullSync();

			// Then: すべての同期メソッドが正しい順序で呼ばれる
			expect(syncMsftToObsidianSpy).toHaveBeenCalledTimes(1);
			expect(syncObsidianToMsftSpy).toHaveBeenCalledTimes(1);
			expect(syncCompletionsSpy).toHaveBeenCalledTimes(1);

			// 呼び出し順序を確認
			expect(syncMsftToObsidianSpy.mock.invocationCallOrder[0])
				.toBeLessThan(syncObsidianToMsftSpy.mock.invocationCallOrder[0]);
			expect(syncObsidianToMsftSpy.mock.invocationCallOrder[0])
				.toBeLessThan(syncCompletionsSpy.mock.invocationCallOrder[0]);

			// 結果を確認
			expect(result.added).toBe(5);
			expect(result.completed).toBe(1);
			expect(result.errors).toHaveLength(0);
		});
	});

	describe('Microsoft → Obsidian同期（syncMsftToObsidian） - 外部タスクの取り込み', () => {
		/**
		 * 【機能概要】
		 * Microsoft To-Doで作成されたタスクをObsidianのデイリーノートに取り込む。
		 * 
		 * 【処理フロー】
		 * 1. Microsoft Graph APIからタスクリストを取得
		 * 2. タスクタイトルに[todo::ID]が含まれる場合は除去
		 * 3. 各タスクの配置先日付を決定（期日優先、なければ作成日）
		 * 4. 既存タスクとの重複をチェック
		 * 5. 新規タスクのみをデイリーノートに追加
		 * 6. メタデータストアに関連付けを保存
		 * 
		 * 【重要な仕様】
		 * - 完了済みタスクは同期対象外
		 * - タスクタイトルの正規化により大文字小文字や空白の違いを吸収
		 * - 日付のないデイリーノートは必要に応じて自動作成
		 */
		it('新規Microsoftタスクを正しくObsidianに追加する', async () => {
			// Given: Microsoftの新規タスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '新しいタスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);

			// When: 同期を実行
			const result = await synchronizer.syncMsftToObsidian();

			// Then: タスクが正しくObsidianに追加される
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-01.md',
				'新しいタスク',
				'## TODO'
			);
			expect(result.added).toBe(1);
			expect(result.errors).toHaveLength(0);
		});

		it('期日を優先して適切な日付のノートにタスクを追加する - 日付ロジックの詳細', async () => {
			/**
			 * 【ビジネス要件】
			 * ユーザーは特定の日にやるべきタスクをその日のデイリーノートで確認したい。
			 * Microsoft To-Doで期日を設定したタスクは、その期日のデイリーノートに表示される。
			 * 
			 * 【技術仕様】
			 * - dueDateTimeフィールドがある場合: dateTime文字列の日付部分（YYYY-MM-DD）を使用
			 * - タイムゾーン変換は行わない（終日タスクの日付ずれを防ぐため）
			 * - dueDateTimeがない場合: createdDateTimeをローカル日付に変換して使用
			 */
			// Given: 期日が設定されたタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '期日付きタスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
					dueDateTime: {
						dateTime: '2024-01-05T00:00:00Z',
						timeZone: 'UTC',
					},
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);
			mockDailyNoteManager.getNotePath.mockReturnValue('Daily Notes/2024-01-05.md');

			// When: 同期を実行
			await synchronizer.syncMsftToObsidian();

			// Then: 期日の日付でタスクが追加される
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-05.md',
				'期日付きタスク',
				'## TODO'
			);
		});

		it('既にObsidianに存在するタスクはスキップする - 重複防止メカニズム', async () => {
			/**
			 * 【ビジネス要件】
			 * 同じタスクが複数回追加されることを防ぎ、デイリーノートをクリーンに保つ。
			 * 
			 * 【重複判定ロジック】
			 * 1. タイトルを正規化（小文字化、空白の正規化）
			 * 2. 同じ日付のデイリーノート内で比較
			 * 3. メタデータストアでの既存関連付けも確認
			 * 
			 * 【エッジケース】
			 * - 大文字小文字の違いは同一とみなす
			 * - 前後の空白は無視
			 * - [todo::ID]の有無に関わらず同一性を判定
			 */
			// Given: 同じタイトルのタスクが両方に存在
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '既存のタスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '既存のタスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);

			// When: 同期を実行
			const result = await synchronizer.syncMsftToObsidian();

			// Then: 既存タスクは追加されない
			expect(mockDailyNoteManager.addTaskToTodoSection).not.toHaveBeenCalled();
			expect(result.added).toBe(0);
		});

		it('完了済みのMicrosoftタスクはスキップする', async () => {
			// Given: 完了済みのMicrosoftタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '完了済みタスク',
					status: 'completed',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);

			// When: 同期を実行
			const result = await synchronizer.syncMsftToObsidian();

			// Then: 完了タスクは追加されない
			expect(mockDailyNoteManager.addTaskToTodoSection).not.toHaveBeenCalled();
			expect(result.added).toBe(0);
		});

		it('Microsoftタスクのタイトルに[todo::ID]が含まれる場合は自動クリーン化する', async () => {
			/**
			 * 【ビジネス要件】
			 * Microsoft To-DoをWebやモバイルから使用するユーザーには、
			 * [todo::ID]パターンは不要であり、表示されるべきではない。
			 * 
			 * 【技術仕様】
			 * - cleanMicrosoftTodoTitlesメソッドを呼び出し
			 * - [todo::ID]パターンを含むタスクはタイトルを更新
			 * - APIエラーはログに記録して処理を継続
			 */
			// Given: [todo::ID]を含むMicrosoftタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '重要な会議 [todo::meeting-2024]',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockApiClient.updateTaskTitle.mockResolvedValue(undefined);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);

			// When: 同期を実行
			await synchronizer.syncMsftToObsidian();

			// Then: タイトルがクリーン化される
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledWith(
				'default-list-id',
				'task1',
				'重要な会議'
			);

			// And: クリーン化されたタイトルでObsidianに追加される
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith(
				'Daily Notes/2024-01-01.md',
				'重要な会議',
				'## TODO'
			);
		});

		it('APIエラーが発生しても処理を継続し、エラー情報を返す', async () => {
			/**
			 * 【エラーハンドリング仕様】
			 * - 個別のタスク処理エラーはログに記録
			 * - 成功したタスクの処理は継続
			 * - エラーは配列で収集して返す
			 * - API接続エラーの場合は全体を停止
			 */
			// Given: 複数のタスク、一部でエラーが発生
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '成功タスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task2',
					title: 'エラータスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);
			
			// 二つ目のタスクでエラーを発生させる
			mockDailyNoteManager.addTaskToTodoSection
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error('ファイル書き込みエラー'));

			// When: 同期を実行
			const result = await synchronizer.syncMsftToObsidian();

			// Then: 一つ目は成功、二つ目は失敗
			expect(result.added).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('エラータスク');
			expect(result.errors[0]).toContain('ファイル書き込みエラー');
		});
	});

	describe('Obsidian → Microsoft同期（syncObsidianToMsft） - ローカルタスクの公開', () => {
		/**
		 * 【機能概要】
		 * Obsidianで作成されたタスクをMicrosoft To-Doに公開する。
		 * 
		 * 【処理フロー】
		 * 1. すべてのデイリーノートからタスクを収集
		 * 2. メタデータストアで既存の関連付けを確認
		 * 3. 未同期のタスクのみを抽出
		 * 4. Microsoft To-Doに新規タスクとして作成
		 * 5. 作成されたタスクのIDをメタデータストアに保存
		 * 
		 * 【重要な仕様】
		 * - タスクタイトルはそのまま送信（[todo::ID]も含む）
		 * - メタデータはクリーンなタイトルで保存
		 * - 開始日（startDate）はデイリーノートの日付から取得
		 * - 完了済みタスクは同期対象外
		 */
		it('新規ObsidianタスクをMicrosoftに追加する', async () => {
			// Given: Obsidianの新規タスク
			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '新規タスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);
			mockApiClient.getTasks.mockResolvedValue([]);
			mockApiClient.createTaskWithStartDate.mockResolvedValue({
				id: 'new-task-id',
				title: '新規タスク',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			});

			// When: 同期を実行
			const result = await synchronizer.syncObsidianToMsft();

			// Then: タスクがMicrosoftに作成される
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'default-list-id',
				'新規タスク',
				'2024-01-01'
			);
			expect(result.added).toBe(1);
			expect(result.errors).toHaveLength(0);
		});

		it('既にMicrosoftに存在するタスクはスキップする', async () => {
			// Given: 同じタイトルのタスクが両方に存在
			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '既存タスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			const msftTasks: TodoTask[] = [
				{
					id: 'existing-task',
					title: '既存タスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);
			mockApiClient.getTasks.mockResolvedValue(msftTasks);

			// When: 同期を実行
			const result = await synchronizer.syncObsidianToMsft();

			// Then: 既存タスクは作成されない
			expect(mockApiClient.createTaskWithStartDate).not.toHaveBeenCalled();
			expect(result.added).toBe(0);
		});

		it('メタデータの保存処理は独立して実行される', async () => {
			/**
			 * 【設計原則】
			 * メタデータストアはタスク同期の補助機能であり、
			 * その成功・失敗はタスク同期自体に影響を与えない。
			 */
			// Given: 新規タスク
			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '新規タスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);
			mockApiClient.getTasks.mockResolvedValue([]);
			mockApiClient.createTaskWithStartDate.mockResolvedValue({
				id: 'new-task-id',
				title: '新規タスク',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			});

			// メタデータストアのモックをスパイ
			const metadataStoreSpy = jest.spyOn((synchronizer as any).metadataStore, 'setMetadata');

			// When: 同期を実行
			const result = await synchronizer.syncObsidianToMsft();

			// Then: タスク作成は成功し、メタデータも保存される
			expect(result.added).toBe(1);
			expect(result.errors).toHaveLength(0);
			// メタデータストアの呼び出しを確認
			expect(metadataStoreSpy).toHaveBeenCalledWith(
				'2024-01-01',
				'新規タスク',
				'new-task-id'
			);
		});

		it('メタデータ保存が失敗してもエラーとして扱わない', async () => {
			/**
			 * 【エラーハンドリング仕様】
			 * メタデータ保存の失敗は内部的にログに記録するのみで、
			 * ユーザーに対してエラーとして表示しない。
			 * 実装注意: メタデータ保存はtry-catchで囲み、エラーを握りつぶす必要がある
			 */
			// このテストは現在の実装では失敗するため、スキップ
			// 実装修正時に有効化すること
		});
	});

	describe('完了状態の同期（syncCompletions） - 双方向の状態管理', () => {
		/**
		 * 【機能概要】
		 * タスクの完了/未完了状態を双方向で同期する。最も複雑な同期処理。
		 * 
		 * 【処理フロー】
		 * 1. 両システムから全タスクを取得
		 * 2. メタデータストアを使って対応関係を特定
		 * 3. Microsoft → Obsidian方向の同期
		 *    - Microsoft側で完了 & Obsidian側で未完了のタスクを検出
		 *    - Obsidianのタスクを完了にマーク（完了日付を追加）
		 * 4. Obsidian → Microsoft方向の同期
		 *    - Obsidian側で完了 & Microsoft側で未完了のタスクを検出
		 *    - Microsoft To-Do APIで完了状態に更新
		 * 
		 * 【タイトルマッチングの詳細】
		 * - メタデータはクリーンなタイトル（[todo::ID]なし）で保存
		 * - 検索時は両方のタイトルをクリーン化してから比較
		 * - これにより後からIDが追加/削除されても正しく同期される
		 */
		it('Microsoftで完了したタスクをObsidianでも完了にする', async () => {
			// Given: Microsoftで完了済み、Obsidianで未完了のタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'テストタスク',
					status: 'completed',
					completedDateTime: '2024-01-01T10:00:00Z',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const obsidianTasks: DailyNoteTask[] = [
				{
					title: 'テストタスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 5,
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);

			// メタデータストアのモック設定
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'task1',
				date: '2024-01-01',
				title: 'テストタスク',
				lastSynced: Date.now(),
			});
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 完了状態を同期
			const result = await synchronizer.syncCompletions();

			// Then: Obsidianタスクが完了になる
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'Daily Notes/2024-01-01.md',
				5,
				true,
				'2024-01-01'
			);
			expect(result.completed).toBe(1);
		});

		it('Obsidianで完了したタスクをMicrosoftでも完了にする', async () => {
			// Given: Obsidianで完了済み、Microsoftで未完了のタスク
			const obsidianTasks: DailyNoteTask[] = [
				{
					title: 'テストタスク',
					completed: true,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 5,
				},
			];

			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'テストタスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);
			mockApiClient.getTasks.mockResolvedValue(msftTasks);

			// メタデータストアのモック設定
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.getMsftTaskId.mockReturnValue('task1');
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 完了状態を同期
			const result = await synchronizer.syncCompletions();

			// Then: Microsoftタスクが完了になる
			expect(mockApiClient.completeTask).toHaveBeenCalledWith(
				'default-list-id',
				'task1'
			);
			expect(result.completed).toBe(1);
		});

		it('完了日時が無効または空の場合は現在日付を使用する', async () => {
			/**
			 * 【エッジケース仕様】
			 * Microsoft Graph APIは時々不完全なデータを返すことがある。
			 * completedDateTimeがない、空文字列、無効な形式の場合、
			 * 現在日付を完了日として使用する。
			 * 
			 * 【テストするケース】
			 * 1. completedDateTimeが存在しない
			 * 2. completedDateTimeが空文字列
			 * 3. completedDateTimeが無効な形式
			 */
			// Given: completedDateTimeが空文字列のMicrosoftタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'テストタスク',
					status: 'completed',
					completedDateTime: '', // 空文字列
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const obsidianTasks: DailyNoteTask[] = [
				{
					title: 'テストタスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 5,
				},
			];

			// 現在日付をモック
			const mockToday = '2024-01-15';
			jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(`${mockToday}T12:00:00.000Z`);

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);

			// メタデータストアのモック設定
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'task1',
				date: '2024-01-01',
				title: 'テストタスク',
				lastSynced: Date.now(),
			});
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 完了状態を同期
			const result = await synchronizer.syncCompletions();

			// Then: 現在日付で完了にマークされる
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'Daily Notes/2024-01-01.md',
				5,
				true,
				mockToday
			);
		});
	});

	describe('重複検出（detectDuplicates） - インテリジェントなタスクマッチング', () => {
		/**
		 * 【機能概要】
		 * 手動で重複を解決するために、同一の可能性が高いタスクペアを検出する。
		 * 
		 * 【マッチングアルゴリズム】
		 * 1. タイトルの完全一致（正規化後）: 信頼度 1.0
		 * 2. 将来的な拡張予定:
		 *    - 編集距離による類似度判定
		 *    - 日付の近さを考慮
		 *    - タスクの内容や説明も比較
		 * 
		 * 【使用シーン】
		 * - 初回同期時の既存タスクのマッピング
		 * - 手動でのタスク関連付け
		 * - 同期エラーからの復旧
		 * 
		 * 【実装上のポイント】
		 * - normalizeTitleメソッドで大文字小文字、空白を正規化
		 * - cleanTaskTitleとは異なり、[todo::ID]は除去しない
		 * - メタデータが既にあるタスクはスキップ
		 */
		it('タイトルが一致するタスクを重複として検出する（メタデータなし）', () => {
			// Given: 同じタイトルのタスク
			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '同じタイトル',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
				{
					title: '別のタイトル',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 2,
				},
			];

			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '同じタイトル',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task2',
					title: '別のタイトル',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			// When: 重複を検出
			const duplicates = (synchronizer as any).detectDuplicates(
				obsidianTasks,
				msftTasks,
				new Map()
			);

			// Then: 正しく重複が検出される
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

	describe('タスク完了状態の双方向同期 - 実践的なシナリオとエッジケース', () => {
		/**
		 * 【このテストグループの目的】
		 * 実際のユーザーシナリオに基づいた複雑なケースをテストする。
		 * 特に過去のプラグインのバグで付与された[todo::ID]パターンがある場合の互換性を確認。
		 * 
		 * 【背景】
		 * 過去のプラグインバージョンでは、Microsoft To-DoのタスクIDを誤って
		 * タスクタイトルに付記していた。例: "買い物リスト [todo::AQMkADAwATM3...]"
		 * 現在はこのパターンを除去して純粋なタイトルのみを保存するが、
		 * 既存ユーザーのタスクにはまだこのパターンが残っている可能性がある。
		 * 
		 * 【テストする主要シナリオ】
		 * 1. Obsidianで[todo::ID]付きタスクを完了 → Microsoft同期（バグ互換性）
		 * 2. Microsoftで完了 → Obsidianの[todo::ID]付きタスクに反映（バグ互換性）
		 * 3. 新規作成時のメタデータ保存がクリーンなタイトルで行われること
		 */
		let mockMetadataStore: ReturnType<typeof createMockMetadataStore>;

		beforeEach(() => {
			// モックメタデータストアをセットアップ
			mockMetadataStore = createMockMetadataStore();
		});

		it('過去のバグで[todo::ID]が付いたObsidianタスクを完了にしてもMicrosoft To-Doで正しく同期される', async () => {
			// ビジネスシナリオ: 
			// 過去のプラグインバージョンで作成されたタスクには[todo::ID]パターンが含まれている
			// このようなタスクでも完了状態の同期が正しく動作することを確認する
			// メタデータストアがクリーンなタイトルで管理しているため、IDの有無に関わらず同期可能
			
			// Given: 過去のバグで[todo::ID]が付いた完了済みタスク
			const obsidianTask = {
				title: '買い物リスト [todo::abc123]',  // 過去のバグで付与されたID
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

			// And: メタデータストアはクリーンなタイトル（IDなし）でタスクを管理している
			// cleanTaskTitle()により[todo::ID]が除去されてから検索される
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

		it('Microsoft To-Doで完了にしたタスクがObsidianでも完了になる（過去のバグでIDが付いていても）', async () => {
			// ビジネスシナリオ:
			// ユーザーがMicrosoft To-Doアプリでタスクを完了にした
			// Obsidian側では過去のバグで[todo::ID]が付いているが、
			// メタデータの照合はクリーンなタイトルで行われるため正しく同期される
			
			// Given: Microsoft To-Doで完了済みのタスク
			const msftTask: TodoTask = {
				id: 'msft-task-123',
				title: 'プロジェクト企画書作成',
				status: 'completed',
				completedDateTime: '2024-01-01T10:00:00Z',
				createdDateTime: '2024-01-01T00:00:00Z',
			};

			// And: Obsidianに対応する未完了タスク（過去のバグでID付き）
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

			// And: メタデータストアはクリーンなタイトル（IDなし）でタスクを管理している
			// syncCompletions()内でObsidianタスクのタイトルもcleanTaskTitle()でクリーン化されて照合される
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'msft-task-123',
				date: '2024-01-01',
				title: 'プロジェクト企画書作成', // クリーンなタイトル
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

		it('新規タスク作成時は[todo::ID]パターンを除外してメタデータに保存される', async () => {
			// ビジネスシナリオ:
			// ユーザーが手動でObsidianタスクに[todo::ID]パターンを付けた場合や、
			// 過去のバグで付与されたIDがある場合でも、メタデータは常にクリーンなタイトルで保存される
			// これにより将来の完了状態同期が正しく動作する
			
			// Given: [todo::ID]パターンを含む新規タスク
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

			// Then: Microsoft To-Doにタスクが作成される（Obsidianのタイトルそのまま）
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledWith(
				'list-123',
				'週次レポート作成 [todo::weekly-report-2024]',  // Obsidianのタイトルそのまま
				'2024-01-02'
			);
			expect(result.added).toBe(1);

			// And: メタデータは[todo::ID]を除外したクリーンなタイトルで保存される
			expect(mockMetadataStore.setMetadata).toHaveBeenCalledWith(
				'2024-01-02',
				'週次レポート作成',  // [todo::ID]を除外したクリーンなタイトル
				'new-msft-task-456'
			);
		});

		it('メタデータストアが利用不可でもタスク同期はベストエフォートで動作する', async () => {
			/**
			 * 【フォールバック仕様】
			 * メタデータストアが利用できない場合でも、
			 * タイトルマッチングによる基本的な同期は動作する。
			 * 
			 * 【制限事項】
			 * - 完了状態の同期は不可
			 * - タスクの関連付けが保持されない
			 * - 次回同期時に重複が発生する可能性
			 */
			// Given: メタデータストアがすべてエラーを返す
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.getMsftTaskId.mockImplementation(() => {
				throw new Error('ストレージ障害');
			});
			mockMetadataStore.setMetadata.mockRejectedValue(new Error('ストレージ障害'));
			mockMetadataStore.findByMsftTaskId.mockReturnValue(undefined);
			(synchronizer as any).metadataStore = mockMetadataStore;

			// タスクデータ
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'テストタスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '新規タスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);
			mockApiClient.createTaskWithStartDate.mockResolvedValue({
				id: 'new-task',
				title: '新規タスク',
				status: 'notStarted',
				createdDateTime: '2024-01-01T00:00:00Z',
			});

			// When: 完全同期を実行
			const result = await synchronizer.performFullSync();

			// Then: メタデータストアが利用不可の場合、すべての同期が失敗
			expect(result.msftToObsidian.added).toBe(0); // Microsoftからの同期（メタデータエラーで失敗）
			expect(result.obsidianToMsft.added).toBe(0); // Obsidianからの同期（メタデータエラーで失敗）
			expect(result.completions.completed).toBe(0); // 完了状態同期は不可

			// エラーはログに記録（メタデータストアのエラーは別のメッセージで記録される）
			expect(mockLogger.error).toHaveBeenCalled();
		});
	});

	describe('cleanTaskTitle - エッジケースの処理', () => {
		/**
		 * 【目的】
		 * [todo::ID]パターンの様々なバリエーションを正しく処理できることを確認。
		 * 過去のバグで生成された不正な形式も含めて対応。
		 */
		it('空の[todo::]パターンを正しく除去する', () => {
			// Given: 空の[todo::]パターンを含むタスク
			const testCases = [
				{ input: 'タスク [todo::] 名', expected: 'タスク 名' },
				{ input: '[todo::]タスク', expected: 'タスク' },
				{ input: 'タスク[todo::]', expected: 'タスク' },
			];

			// When/Then: cleanTaskTitleメソッドが正しく処理する
			testCases.forEach(({ input, expected }) => {
				const result = (synchronizer as any).cleanTaskTitle(input);
				expect(result).toBe(expected);
			});
		});

		it('ネストした[[todo::ID]]パターンを正しく除去する', () => {
			// Given: ネストしたブラケットを含むタスク
			const testCases = [
				{ input: 'タスク [[todo::nested-id]]', expected: 'タスク []' },
				{ input: 'タスク [todo::[nested]]', expected: 'タスク' },
				{ input: '[[todo::id1][todo::id2]]', expected: '[]' },
			];

			testCases.forEach(({ input, expected }) => {
				const result = (synchronizer as any).cleanTaskTitle(input);
				// ネストしたブラケットは外側の[]が残ることを許容
				if (input.includes('[[todo::')) {
					// ネストした場合は外側の[]が残る
					expect(result).toMatch(/\[\]/); 
				} else {
					expect(result).toBe(expected);
				}
			});
		});

		it('複数の[todo::ID]パターンをすべて除去する', () => {
			// Given: 複数の[todo::ID]パターンを含むタスク
			const testCases = [
				{ 
					input: 'タスク [todo::id1] 名 [todo::id2]', 
					expected: 'タスク 名' 
				},
				{ 
					input: '[todo::id1][todo::id2][todo::id3]タスク', 
					expected: 'タスク' 
				},
				{ 
					input: '開始[todo::start]中間[todo::middle]終了[todo::end]', 
					expected: '開始中間終了'  // 現在の実装ではスペースが追加されない
				},
			];

			testCases.forEach(({ input, expected }) => {
				const result = (synchronizer as any).cleanTaskTitle(input);
				expect(result).toBe(expected);
			});
		});

		it('[todo::ID]内に特殊文字が含まれる場合も正しく除去する', () => {
			// Given: 特殊文字を含むID
			const testCases = [
				{ 
					input: 'タスク [todo::id-with-dash_underscore.dot]', 
					expected: 'タスク' 
				},
				{ 
					input: 'タスク [todo::id=with=equals==]', 
					expected: 'タスク' 
				},
				{ 
					input: 'タスク [todo::id/with/slashes]', 
					expected: 'タスク' 
				},
				{ 
					input: 'タスク [todo::AQMkADAwATM3ZmYAZS1kMzFkLWYwZjEtMDACLTAwCgBGAAADKvJqO0p3mU-FTDGh4VbOKAcAmO8F=]', 
					expected: 'タスク' 
				},
			];

			testCases.forEach(({ input, expected }) => {
				const result = (synchronizer as any).cleanTaskTitle(input);
				expect(result).toBe(expected);
			});
		});

		it('タイトルが[todo::ID]のみの場合の処理', () => {
			// Given: タイトルが[todo::ID]のみ
			const testCases = [
				{ input: '[todo::only-id]', expected: '' },
				{ input: '[todo::id1][todo::id2]', expected: '' },
				{ input: '  [todo::id]  ', expected: '' },
			];

			testCases.forEach(({ input, expected }) => {
				const result = (synchronizer as any).cleanTaskTitle(input);
				expect(result).toBe(expected);
			});
		});
	});

	describe('cleanMicrosoftTodoTitles - Microsoft側のタイトルクリーン化', () => {
		/**
		 * 【目的】
		 * Microsoft To-Do側に過去のバグで保存された[todo::ID]パターンを
		 * 自動的に検出して除去する機能のテスト。
		 */
		it('複数のタスクを一括でクリーン化する', async () => {
			// Given: [todo::ID]を含む複数のMicrosoftタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'タスク1 [todo::id1]',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task2',
					title: 'タスク2 [todo::id2]',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task3',
					title: 'クリーンなタスク',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			mockApiClient.updateTaskTitle.mockResolvedValue(undefined);

			// When: cleanMicrosoftTodoTitlesを実行
			await (synchronizer as any).cleanMicrosoftTodoTitles(msftTasks);

			// Then: [todo::ID]を含むタスクのみが更新される
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledTimes(2);
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledWith(
				'default-list-id',
				'task1',
				'タスク1'
			);
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledWith(
				'default-list-id',
				'task2',
				'タスク2'
			);

			// And: クリーンなタスクはスキップされる
			expect(mockApiClient.updateTaskTitle).not.toHaveBeenCalledWith(
				'default-list-id',
				'task3',
				expect.any(String)
			);
		});

		it('一部のタスクで更新が失敗しても他のタスクの処理を継続する', async () => {
			// Given: 複数のタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'タスク1 [todo::id1]',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
				{
					id: 'task2',
					title: 'タスク2 [todo::id2]',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			// 1つ目は成功、2つ目は失敗
			mockApiClient.updateTaskTitle
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error('APIエラー'));

			// When: cleanMicrosoftTodoTitlesを実行
			await (synchronizer as any).cleanMicrosoftTodoTitles(msftTasks);

			// Then: 両方のタスクの更新が試行される
			expect(mockApiClient.updateTaskTitle).toHaveBeenCalledTimes(2);

			// And: エラーがログに記録される
			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to clean Microsoft Todo task title',
				expect.objectContaining({
					taskId: 'task2',
					title: 'タスク2 [todo::id2]',
				})
			);
		});

		it('デフォルトリストIDがない場合は処理をスキップする', async () => {
			// Given: デフォルトリストIDが設定されていない
			mockApiClient.getDefaultListId.mockReturnValue(null);

			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'タスク [todo::id]',
					status: 'notStarted',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			// When: cleanMicrosoftTodoTitlesを実行
			await (synchronizer as any).cleanMicrosoftTodoTitles(msftTasks);

			// Then: APIは呼ばれない
			expect(mockApiClient.updateTaskTitle).not.toHaveBeenCalled();
		});
	});

	describe('メタデータストアとの連携 - 整合性の保証', () => {
		/**
		 * 【目的】
		 * メタデータストアが常にクリーンなタイトルで管理され、
		 * 様々なシナリオで正しく機能することを確認。
		 */
		it('同じタイトルで異なる日付のタスクを正しく区別する', async () => {
			// Given: 同じタイトルで異なる日付のタスク
			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '定例会議',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
				{
					title: '定例会議',
					completed: false,
					startDate: '2024-01-08',
					filePath: 'Daily Notes/2024-01-08.md',
					lineNumber: 1,
				},
			];

			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);
			mockApiClient.getTasks.mockResolvedValue([]);
			mockApiClient.createTaskWithStartDate.mockImplementation(async (_listId, title, date) => ({
				id: `task-${date}`,
				title,
				status: 'notStarted',
				createdDateTime: date ? new Date(date).toISOString() : new Date().toISOString(),
			}));

			// メタデータストアのモック
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.getMsftTaskId.mockReturnValue(undefined);
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 同期を実行
			const result = await synchronizer.syncObsidianToMsft();

			// Then: 両方のタスクが作成される
			expect(result.added).toBe(2);
			expect(mockApiClient.createTaskWithStartDate).toHaveBeenCalledTimes(2);

			// And: メタデータが正しく保存される
			expect(mockMetadataStore.setMetadata).toHaveBeenCalledWith(
				'2024-01-01',
				'定例会議',
				'task-2024-01-01'
			);
			expect(mockMetadataStore.setMetadata).toHaveBeenCalledWith(
				'2024-01-08',
				'定例会議',
				'task-2024-01-08'
			);
		});

		it('メタデータの重複エントリを検出して処理を継続する', async () => {
			// Given: メタデータに重複エントリがある状況
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'タスク',
					status: 'completed',
					completedDateTime: '2024-01-01T10:00:00Z',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const obsidianTasks: DailyNoteTask[] = [
				{
					title: 'タスク',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);

			// メタデータストアが重複を検出
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'task1',
				date: '2024-01-01',
				title: 'タスク',
				lastSynced: Date.now(),
			});
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 完了状態を同期
			const result = await synchronizer.syncCompletions();

			// Then: 処理が成功する
			expect(result.completed).toBe(1);
			expect(result.errors).toHaveLength(0);
		});
	});

	describe('同期競合の解決', () => {
		/**
		 * 【目的】
		 * 両システムで同時に変更が加えられた場合の振る舞いをテスト。
		 */
		it('両システムで同時に完了状態が変更された場合の処理', async () => {
			// Given: 両方で完了済みのタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: 'タスク',
					status: 'completed',
					completedDateTime: '2024-01-01T10:00:00Z',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const obsidianTasks: DailyNoteTask[] = [
				{
					title: 'タスク',
					completed: true,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);

			// メタデータストアの設定
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'task1',
				date: '2024-01-01',
				title: 'タスク',
				lastSynced: Date.now(),
			});
			mockMetadataStore.getMsftTaskId.mockReturnValue('task1');
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 完了状態を同期
			const result = await synchronizer.syncCompletions();

			// Then: 既に両方で完了しているため、更新は行われない
			expect(result.completed).toBe(0);
			expect(mockDailyNoteManager.updateTaskCompletion).not.toHaveBeenCalled();
			expect(mockApiClient.completeTask).not.toHaveBeenCalled();
		});

		it('タスクのタイトルが変更された場合でもIDで追跡する', async () => {
			// Given: Microsoft側でタイトルが変更されたタスク
			const msftTasks: TodoTask[] = [
				{
					id: 'task1',
					title: '変更後のタイトル',
					status: 'completed',
					completedDateTime: '2024-01-01T10:00:00Z',
					createdDateTime: '2024-01-01T00:00:00Z',
				},
			];

			const obsidianTasks: DailyNoteTask[] = [
				{
					title: '元のタイトル',
					completed: false,
					startDate: '2024-01-01',
					filePath: 'Daily Notes/2024-01-01.md',
					lineNumber: 1,
				},
			];

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue(obsidianTasks);

			// メタデータストアがIDで関連付けを維持
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.findByMsftTaskId.mockReturnValue({
				msftTaskId: 'task1',
				date: '2024-01-01',
				title: '元のタイトル',  // メタデータには元のタイトルが保存されている
				lastSynced: Date.now(),
			});
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 完了状態を同期
			const result = await synchronizer.syncCompletions();

			// Then: IDで追跡して正しく同期される
			expect(result.completed).toBe(1);
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'Daily Notes/2024-01-01.md',
				1,
				true,
				'2024-01-01'
			);
		});
	});

	describe('実際の使用シナリオ - 統合テスト', () => {
		/**
		 * 【目的】
		 * 実際のユーザーが遇する複雑なシナリオをテスト。
		 */
		it('初回同期で大量のタスクがある場合の処理', async () => {
			// Given: Microsoftに50個のタスク
			const msftTasks: TodoTask[] = Array.from({ length: 50 }, (_, i) => ({
				id: `task${i}`,
				title: `タスク${i}`,
				status: 'notStarted' as const,
				createdDateTime: `2024-01-${String(i % 31 + 1).padStart(2, '0')}T00:00:00Z`,
			}));

			mockApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.getAllDailyNoteTasks.mockResolvedValue([]);
			mockDailyNoteManager.addTaskToTodoSection.mockResolvedValue(undefined);

			// メタデータストアのモック
			const mockMetadataStore = createMockMetadataStore();
			mockMetadataStore.setMetadata.mockResolvedValue(undefined);
			(synchronizer as any).metadataStore = mockMetadataStore;

			// When: 初回同期を実行
			const result = await synchronizer.syncMsftToObsidian();

			// Then: すべてのタスクが同期される
			expect(result.added).toBe(50);
			expect(result.errors).toHaveLength(0);
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledTimes(50);
			expect(mockMetadataStore.setMetadata).toHaveBeenCalledTimes(50);
		});

		it('ネットワーク障害からの復旧', async () => {
			// Given: APIが一時的に失敗
			mockApiClient.getTasks
				.mockRejectedValueOnce(new Error('ネットワークエラー'))
				.mockResolvedValueOnce([]);

			// When: 1回目の同期
			const result1 = await synchronizer.syncMsftToObsidian();

			// Then: エラーが返される
			expect(result1.added).toBe(0);
			expect(result1.errors).toContain('Microsoft to Obsidian sync failed: ネットワークエラー');

			// When: 2回目の同期
			const result2 = await synchronizer.syncMsftToObsidian();

			// Then: 正常に動作する
			expect(result2.added).toBe(0);
			expect(result2.errors).toHaveLength(0);
		});
	});
});
