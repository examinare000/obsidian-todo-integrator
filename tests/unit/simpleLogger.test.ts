/**
 * SimpleLoggerのテストスイート
 * ログの記録、エクスポート、機密情報のマスキング機能をテスト
 */

import { SimpleLogger } from '../../src/utils/simpleLogger';
import { mockConsole } from '../__mocks__/mockFactories';

describe('SimpleLogger', () => {
	let logger: SimpleLogger;

	// コンソールメソッドをモック化
	mockConsole();

	beforeEach(() => {
		logger = new SimpleLogger('info');
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('ログのエクスポート機能', () => {
		it('ログがない場合は空文字列を返す', () => {
			const exported = logger.exportLogs();
			expect(exported).toBe('');
		});

		it('ログを正しいフォーマットでエクスポートする', () => {
			// Given: 異なるレベルのログメッセージ
			logger.info('テスト情報メッセージ');
			logger.error('テストエラーメッセージ', { details: 'エラーの詳細' });
			
			// When: ログをエクスポート
			const exported = logger.exportLogs();
			const lines = exported.split('\n');
			
			// Then: 正しいフォーマットで出力される
			expect(lines).toHaveLength(2);
			expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] テスト情報メッセージ$/);
			expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\] テストエラーメッセージ \| Context: {"details":"エラーの詳細"}$/);
		});

		it('現在のログレベル以上のログのみエクスポートする', () => {
			// Given: ログレベルをwarnに設定
			logger.setLogLevel('warn');
			
			// When: 各レベルでログを記録
			logger.debug('デバッグメッセージ');
			logger.info('情報メッセージ');
			logger.warn('警告メッセージ');
			logger.error('エラーメッセージ');
			
			// Then: warn以上のログのみエクスポートされる
			const exported = logger.exportLogs();
			const lines = exported.split('\n').filter(line => line.length > 0);
			
			expect(lines).toHaveLength(2);
			expect(lines[0]).toContain('[WARN] 警告メッセージ');
			expect(lines[1]).toContain('[ERROR] エラーメッセージ');
		});

		describe('機密情報のマスキング', () => {
			it('JWTトークンをマスクする', () => {
				// Given: JWTトークンを含むログ
				logger.info('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
				
				// When: ログをエクスポート
				const exported = logger.exportLogs();
				
				// Then: トークンがマスクされる
				expect(exported).toContain('Bearer [MASKED]');
				expect(exported).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
			});

			it('パスワードをマスクする', () => {
				// Given: パスワードを含むログ
				logger.info('password=secretPassword123');
				
				// When: ログをエクスポート
				const exported = logger.exportLogs();
				
				// Then: パスワードがマスクされる
				expect(exported).toContain('password=[MASKED]');
				expect(exported).not.toContain('secretPassword123');
			});

			it('ユーザーパスの個人情報をマスクする', () => {
				// Given: ユーザーパスを含むログ
				logger.info('User path: /Users/johndoe/Documents');
				
				// When: ログをエクスポート
				const exported = logger.exportLogs();
				
				// Then: ユーザー名がマスクされる
				expect(exported).toContain('/Users/[MASKED]/Documents');
				expect(exported).not.toContain('johndoe');
			});

			it('コンテキストオブジェクト内の機密情報もマスクする', () => {
				// Given: 機密情報を含むコンテキスト
				logger.info('テストメッセージ', {
					userId: 123,
					action: 'sync',
					token: 'secret-token-123'
				});
				
				// When: ログをエクスポート
				const exported = logger.exportLogs();
				
				// Then: トークンのみマスクされる
				expect(exported).toContain('"userId":123');
				expect(exported).toContain('"action":"sync"');
				expect(exported).toContain('"token":"[MASKED]"');
			});
		});

		describe('履歴サイズの制限', () => {
			it('最大履歴サイズ（10000件）を超えた場合、古いログが削除される', () => {
				// Given: 10050件のログメッセージ
				for (let i = 0; i < 10050; i++) {
					logger.info(`メッセージ ${i}`);
				}
				
				// When: ログをエクスポート
				const exported = logger.exportLogs();
				const lines = exported.split('\n').filter(line => line.length > 0);
				
				// Then: 最新の10000件のみ保持される
				expect(lines).toHaveLength(10000);
				expect(lines[0]).toContain('メッセージ 50'); // 最初の50件は削除される
				expect(lines[9999]).toContain('メッセージ 10049'); // 最後は10049番目
			});
		});

		describe('バッチ処理の効率性', () => {
			it('大量のログを効率的に処理できる', () => {
				// Given: 250件のログメッセージ
				for (let i = 0; i < 250; i++) {
					logger.info(`バッチテスト ${i}`);
				}
				
				// When: ログをエクスポート
				const exported = logger.exportLogs();
				const lines = exported.split('\n').filter(line => line.length > 0);
				
				// Then: すべてのメッセージが正しく処理される
				expect(lines).toHaveLength(250);
				// 最初、中間、最後のメッセージを確認
				expect(lines[0]).toContain('バッチテスト 0');
				expect(lines[99]).toContain('バッチテスト 99');
				expect(lines[100]).toContain('バッチテスト 100');
				expect(lines[249]).toContain('バッチテスト 249');
			});
		});

		it('ログレベル変更後も履歴を維持する', () => {
			// Given: ログレベルを変更しながらログを記録
			logger.info('情報メッセージ 1');
			logger.setLogLevel('error');
			logger.error('エラーメッセージ');
			logger.info('情報メッセージ 2'); // errorレベルのため記録されない
			logger.setLogLevel('info');
			logger.info('情報メッセージ 3');
			
			// When: ログをエクスポート
			const exported = logger.exportLogs();
			const lines = exported.split('\n').filter(line => line.length > 0);
			
			// Then: レベルに応じて記録されたログのみ出力される
			expect(lines).toHaveLength(3);
			expect(lines[0]).toContain('情報メッセージ 1');
			expect(lines[1]).toContain('エラーメッセージ');
			expect(lines[2]).toContain('情報メッセージ 3');
		});
	});

	describe('履歴のクリア機能', () => {
		it('すべてのログ履歴をクリアできる', () => {
			// Given: いくつかのログメッセージ
			logger.info('メッセージ 1');
			logger.error('メッセージ 2');
			
			// When: 履歴をクリア
			expect(logger.exportLogs()).not.toBe('');
			logger.clearHistory();
			
			// Then: 履歴が空になる
			expect(logger.exportLogs()).toBe('');
		});
	});

	describe('ログ履歴の取得', () => {
		it('ログ履歴のコピーを返す', () => {
			// Given: コンテキスト付きのログメッセージ
			logger.info('テストメッセージ', { data: 'テストデータ' });
			
			// When: 履歴を取得
			const history = logger.getLogHistory();
			
			// Then: 正しい構造で履歴が返される
			expect(history).toHaveLength(1);
			expect(history[0]).toMatchObject({
				level: 'info',
				message: 'テストメッセージ',
				context: { data: 'テストデータ' }
			});
			
			// 返された履歴を変更しても内部履歴に影響しない
			history[0].message = '変更されたメッセージ';
			const newHistory = logger.getLogHistory();
			expect(newHistory[0].message).toBe('テストメッセージ');
		});
	});
});