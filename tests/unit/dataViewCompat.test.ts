import { DataViewCompat } from '../../src/utils/DataViewCompat';
import { App } from 'obsidian';
import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('DataViewCompat', () => {
	let mockApp: any;
	let logger: SimpleLogger;
	let dataViewCompat: DataViewCompat;

	beforeEach(() => {
		// Create mock app
		mockApp = {
			plugins: {
				plugins: {}
			}
		};

		// Create logger
		logger = new SimpleLogger('info');
		jest.spyOn(logger, 'info').mockImplementation();
		jest.spyOn(logger, 'debug').mockImplementation();
		jest.spyOn(logger, 'error').mockImplementation();
	});

	describe('DataViewプラグイン検出', () => {
		it('DataViewプラグインが存在しない場合はデフォルト形式を使用', () => {
			// Arrange
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act
			const format = dataViewCompat.getCompletionFormat('2024-01-01');

			// Assert
			expect(format).toBe(' ✅ 2024-01-01');
			expect(dataViewCompat.shouldUseEmojiShorthand()).toBe(false);
		});

		it('DataViewプラグインが存在する場合は検出される', () => {
			// Arrange
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionTracking: true,
					taskCompletionUseEmojiShorthand: true,
					taskCompletionText: '✅',
					taskCompletionDateFormat: 'YYYY-MM-DD'
				}
			};

			// Act
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Assert
			expect(logger.info).toHaveBeenCalledWith('DataView plugin detected', {
				version: '0.5.0'
			});
		});

		it('DataViewプラグインチェック時のエラーをハンドリング', () => {
			// Arrange
			Object.defineProperty(mockApp, 'plugins', {
				get() { throw new Error('Plugin access error'); }
			});

			// Act
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Assert
			expect(logger.error).toHaveBeenCalledWith('Error checking DataView plugin', 
				expect.objectContaining({ error: expect.any(Error) }));
		});
	});

	describe('完了フォーマット生成', () => {
		it('DataViewなし: デフォルト形式を返す', () => {
			// Arrange
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.getCompletionFormat('2024-01-01')).toBe(' ✅ 2024-01-01');
		});

		it('DataViewあり＆絵文字ショートハンド有効: DataView形式を返す', () => {
			// Arrange
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionUseEmojiShorthand: true,
					taskCompletionText: '✅'
				}
			};
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.getCompletionFormat('2024-01-01')).toBe(' ✅ 2024-01-01');
		});

		it('DataViewあり＆絵文字ショートハンド無効: デフォルト形式を返す', () => {
			// Arrange
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionUseEmojiShorthand: false,
					taskCompletionText: '✅'
				}
			};
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.getCompletionFormat('2024-01-01')).toBe(' ✅ 2024-01-01');
		});

		it('カスタム完了テキスト: カスタムテキストを使用', () => {
			// Arrange
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionUseEmojiShorthand: true,
					taskCompletionText: '✓'
				}
			};
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.getCompletionFormat('2024-01-01')).toBe(' ✓ 2024-01-01');
		});
	});

	describe('完了日の解析', () => {
		beforeEach(() => {
			// Setup DataView with custom completion text
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionUseEmojiShorthand: true,
					taskCompletionText: '✓'
				}
			};
			dataViewCompat = new DataViewCompat(mockApp as App, logger);
		});

		it('絵文字形式の完了日を解析', () => {
			// Act & Assert
			expect(dataViewCompat.parseCompletionDate('Buy milk ✅ 2024-01-01')).toBe('2024-01-01');
			expect(dataViewCompat.parseCompletionDate('Task without date ✅')).toBeNull();
			expect(dataViewCompat.parseCompletionDate('✅2024-01-01')).toBe('2024-01-01');
		});

		it('カスタム完了テキスト形式の完了日を解析', () => {
			// Act & Assert
			expect(dataViewCompat.parseCompletionDate('Buy milk ✓ 2024-01-01')).toBe('2024-01-01');
			expect(dataViewCompat.parseCompletionDate('✓ 2024-01-01 at start')).toBe('2024-01-01');
		});

		it('インラインフィールド形式の完了日を解析', () => {
			// Act & Assert
			expect(dataViewCompat.parseCompletionDate('Buy milk [completion:: 2024-01-01]')).toBe('2024-01-01');
			expect(dataViewCompat.parseCompletionDate('[completion::2024-01-01]')).toBe('2024-01-01'); // スペースなしもサポート
			expect(dataViewCompat.parseCompletionDate('[completion:: 2024-01-01]')).toBe('2024-01-01');
		});

		it('完了日が含まれない場合はnullを返す', () => {
			// Act & Assert
			expect(dataViewCompat.parseCompletionDate('Buy milk')).toBeNull();
			expect(dataViewCompat.parseCompletionDate('')).toBeNull();
			expect(dataViewCompat.parseCompletionDate('Task with valid date ✅ 2024-01-01')).toBe('2024-01-01');
		});

		it('特殊文字を含む完了テキストを正しくエスケープ', () => {
			// Arrange
			mockApp.plugins.plugins.dataview.settings.taskCompletionText = '[DONE]';
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.parseCompletionDate('Task [DONE] 2024-01-01')).toBe('2024-01-01');
		});
	});

	describe('設定の更新', () => {
		it('DataViewプラグインがある場合、設定を再読み込みできる', async () => {
			// Arrange
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionUseEmojiShorthand: true,
					taskCompletionText: '✅'
				}
			};
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Modify settings
			mockApp.plugins.plugins.dataview.settings.taskCompletionText = '✓';

			// Act
			await dataViewCompat.refreshSettings();

			// Assert
			expect(dataViewCompat.getCompletionFormat('2024-01-01')).toBe(' ✓ 2024-01-01');
		});

		it('DataViewプラグインがない場合、設定再読み込みは何もしない', async () => {
			// Arrange
			dataViewCompat = new DataViewCompat(mockApp as App, logger);
			const debugSpy = jest.spyOn(logger, 'debug');

			// Act
			await dataViewCompat.refreshSettings();

			// Assert
			expect(debugSpy).not.toHaveBeenCalledWith('DataView settings loaded', expect.any(Object));
		});
	});

	describe('絵文字ショートハンド判定', () => {
		it('DataViewなし: falseを返す', () => {
			// Arrange
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.shouldUseEmojiShorthand()).toBe(false);
		});

		it('DataViewあり＆設定有効: trueを返す', () => {
			// Arrange
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionUseEmojiShorthand: true
				}
			};
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.shouldUseEmojiShorthand()).toBe(true);
		});

		it('DataViewあり＆設定無効: falseを返す', () => {
			// Arrange
			mockApp.plugins.plugins.dataview = {
				manifest: { version: '0.5.0' },
				settings: {
					taskCompletionUseEmojiShorthand: false
				}
			};
			dataViewCompat = new DataViewCompat(mockApp as App, logger);

			// Act & Assert
			expect(dataViewCompat.shouldUseEmojiShorthand()).toBe(false);
		});
	});
});