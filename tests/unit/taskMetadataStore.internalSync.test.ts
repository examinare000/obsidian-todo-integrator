import { Plugin } from 'obsidian';
import { TaskMetadataStore } from '../../src/sync/TaskMetadataStore';
import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('TaskMetadataStore - 内部同期サポート', () => {
	let store: TaskMetadataStore;
	let mockPlugin: Plugin;
	let mockLogger: SimpleLogger;
	let mockLoadData: jest.Mock;
	let mockSaveData: jest.Mock;

	beforeEach(() => {
		// プラグインのモック設定
		mockLoadData = jest.fn().mockResolvedValue({});
		mockSaveData = jest.fn().mockResolvedValue(undefined);
		
		mockPlugin = {
			loadData: mockLoadData,
			saveData: mockSaveData
		} as any;

		// ロガーのモック設定
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			setLogLevel: jest.fn()
		} as any;

		store = new TaskMetadataStore(mockPlugin, mockLogger);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('getAllMetadata', () => {
		it('保存されているすべてのメタデータを返す', async () => {
			// セットアップ: 複数のメタデータを追加
			await store.setMetadata('2025-06-26', 'タスク1', 'msft-1');
			await store.setMetadata('2025-06-26', 'タスク2', 'msft-2');
			await store.setMetadata('2025-06-27', 'タスク3', 'msft-3');

			// 実行
			const allMetadata = (store as any).getAllMetadata();

			// 検証
			expect(allMetadata).toHaveLength(3);
			expect(allMetadata).toEqual(expect.arrayContaining([
				expect.objectContaining({
					date: '2025-06-26',
					title: 'タスク1',
					msftTaskId: 'msft-1'
				}),
				expect.objectContaining({
					date: '2025-06-26',
					title: 'タスク2',
					msftTaskId: 'msft-2'
				}),
				expect.objectContaining({
					date: '2025-06-27',
					title: 'タスク3',
					msftTaskId: 'msft-3'
				})
			]));
		});
	});

	describe('findByPartialTitle', () => {
		beforeEach(async () => {
			// セットアップ: テストデータを追加
			await store.setMetadata('2025-06-26', '買い物リスト', 'msft-1');
			await store.setMetadata('2025-06-26', '山田さんに電話', 'msft-2');
			await store.setMetadata('2025-06-26', 'ドキュメントレビュー', 'msft-3');
			await store.setMetadata('2025-06-27', '牛乳を買う', 'msft-4');
		});

		it('部分一致でメタデータを検索できる', async () => {
			// 大文字小文字を区別しない部分一致のテスト
			const result = (store as any).findByPartialTitle('2025-06-26', '買い物');
			
			expect(result).toBeDefined();
			expect(result.title).toBe('買い物リスト');
			expect(result.msftTaskId).toBe('msft-1');
		});

		it('文字列の一部でマッチできる', async () => {
			const result = (store as any).findByPartialTitle('2025-06-26', '山田');
			
			expect(result).toBeDefined();
			expect(result.title).toBe('山田さんに電話');
			expect(result.msftTaskId).toBe('msft-2');
		});

		it('部分一致が見つからない場合はundefinedを返す', async () => {
			const result = (store as any).findByPartialTitle('2025-06-26', '存在しない');
			
			expect(result).toBeUndefined();
		});

		it('指定された日付内でのみ検索する', async () => {
			// 2025-06-27の「牛乳を買う」は見つからない
			const result = (store as any).findByPartialTitle('2025-06-26', '牛乳');
			
			expect(result).toBeUndefined();
		});

		it('正規表現の特殊文字を含む検索を処理できる', async () => {
			await store.setMetadata('2025-06-26', 'タスク（括弧付き）', 'msft-5');
			
			const result = (store as any).findByPartialTitle('2025-06-26', '（括弧付き）');
			
			expect(result).toBeDefined();
			expect(result.title).toBe('タスク（括弧付き）');
		});
	});

	describe('removeMetadataByMsftId', () => {
		it('Microsoft タスクIDでメタデータを削除できる', async () => {
			// セットアップ
			await store.setMetadata('2025-06-26', '削除するタスク', 'msft-remove-1');
			await store.setMetadata('2025-06-26', '残すタスク', 'msft-keep-1');

			// 実行
			const removed = await (store as any).removeMetadataByMsftId('msft-remove-1');

			// 検証
			expect(removed).toBe(true);
			expect(store.getMsftTaskId('2025-06-26', '削除するタスク')).toBeUndefined();
			expect(store.getMsftTaskId('2025-06-26', '残すタスク')).toBe('msft-keep-1');
		});

		it('存在しないIDの場合はfalseを返す', async () => {
			const removed = await (store as any).removeMetadataByMsftId('存在しないID');
			expect(removed).toBe(false);
		});
	});

	describe('getMetadataByDateRange', () => {
		beforeEach(async () => {
			// セットアップ: 複数の日付にまたがるメタデータを追加
			await store.setMetadata('2025-06-24', 'タスク1', 'msft-1');
			await store.setMetadata('2025-06-25', 'タスク2', 'msft-2');
			await store.setMetadata('2025-06-26', 'タスク3', 'msft-3');
			await store.setMetadata('2025-06-27', 'タスク4', 'msft-4');
			await store.setMetadata('2025-06-28', 'タスク5', 'msft-5');
		});

		it('日付範囲内のメタデータを返す', async () => {
			const results = (store as any).getMetadataByDateRange('2025-06-25', '2025-06-27');
			
			expect(results).toHaveLength(3);
			expect(results.map((m: any) => m.title)).toEqual(['タスク2', 'タスク3', 'タスク4']);
		});

		it('開始日と終了日を含む', async () => {
			const results = (store as any).getMetadataByDateRange('2025-06-24', '2025-06-24');
			
			expect(results).toHaveLength(1);
			expect(results[0].title).toBe('タスク1');
		});

		it('範囲内にメタデータがない場合は空配列を返す', async () => {
			const results = (store as any).getMetadataByDateRange('2025-07-01', '2025-07-31');
			
			expect(results).toHaveLength(0);
		});
	});

	describe('hasMetadataForTask', () => {
		it('タスクのメタデータが存在する場合はtrueを返す', async () => {
			await store.setMetadata('2025-06-26', '既存のタスク', 'msft-1');
			
			const exists = (store as any).hasMetadataForTask('2025-06-26', '既存のタスク');
			expect(exists).toBe(true);
		});

		it('メタデータが存在しない場合はfalseを返す', async () => {
			const exists = (store as any).hasMetadataForTask('2025-06-26', '存在しないタスク');
			expect(exists).toBe(false);
		});
	});

	describe('updateMetadataByMsftId', () => {
		it('Microsoft タスクIDでメタデータフィールドを更新できる', async () => {
			// セットアップ
			await store.setMetadata('2025-06-26', '元のタイトル', 'msft-1');

			// 実行: タイトルと日付を更新
			const updated = await (store as any).updateMetadataByMsftId('msft-1', {
				title: '更新されたタイトル',
				date: '2025-06-27'
			});

			// 検証
			expect(updated).toBe(true);
			expect(store.getMsftTaskId('2025-06-26', '元のタイトル')).toBeUndefined();
			expect(store.getMsftTaskId('2025-06-27', '更新されたタイトル')).toBe('msft-1');
		});

		it('更新時にlastSyncedタイムスタンプを保持する', async () => {
			await store.setMetadata('2025-06-26', 'タスク', 'msft-1');
			
			const beforeUpdate = Date.now();
			await new Promise(resolve => setTimeout(resolve, 10)); // 小さな遅延
			
			await (store as any).updateMetadataByMsftId('msft-1', {
				title: '更新されたタスク'
			});
			
			const metadata = store.findByMsftTaskId('msft-1');
			expect(metadata?.lastSynced).toBeGreaterThanOrEqual(beforeUpdate);
		});

		it('Microsoft タスクIDが見つからない場合はfalseを返す', async () => {
			const updated = await (store as any).updateMetadataByMsftId('存在しない', {
				title: '新しいタイトル'
			});
			
			expect(updated).toBe(false);
		});
	});
});