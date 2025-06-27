import { DailyNotesDetector } from '../../src/utils/DailyNotesDetector';
import { App } from 'obsidian';
import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('DailyNotesDetector', () => {
	let mockApp: any;
	let logger: SimpleLogger;
	let detector: DailyNotesDetector;

	beforeEach(() => {
		// Create mock app
		mockApp = {
			internalPlugins: {
				getPluginById: jest.fn()
			}
		};

		// Create logger
		logger = new SimpleLogger('info');
		jest.spyOn(logger, 'info').mockImplementation();
		jest.spyOn(logger, 'debug').mockImplementation();
		jest.spyOn(logger, 'error').mockImplementation();

		detector = new DailyNotesDetector(mockApp as App, logger);
	});

	describe('Daily Notesプラグイン検出', () => {
		it('プラグインが存在しない場合はフォールバック値を返す', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue(null);

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults).toEqual({
				dateFormat: 'YYYY-MM-DD',
				folder: 'Daily Notes',
				template: undefined
			});
			expect(logger.info).toHaveBeenCalledWith(
				'Daily Notes plugin not found or not enabled, using fallback defaults'
			);
		});

		it('プラグインが無効の場合はフォールバック値を返す', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: false
			});

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults).toEqual({
				dateFormat: 'YYYY-MM-DD',
				folder: 'Daily Notes',
				template: undefined
			});
		});

		it('プラグイン設定を正しく検出する', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: true,
				instance: {
					options: {
						format: 'YYYY/MM/DD',
						folder: 'Journal',
						template: 'Templates/Daily.md'
					}
				}
			});

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults).toEqual({
				dateFormat: 'YYYY/MM/DD',
				folder: 'Journal',
				template: 'Templates/Daily.md'
			});
			expect(logger.info).toHaveBeenCalledWith('Daily Notes plugin settings detected', {
				dateFormat: 'YYYY/MM/DD',
				folder: 'Journal',
				template: 'Templates/Daily.md'
			});
		});

		it('部分的な設定でもフォールバック値で補完する', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: true,
				instance: {
					options: {
						format: 'DD-MM-YYYY',
						// folder and template are missing
					}
				}
			});

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults).toEqual({
				dateFormat: 'DD-MM-YYYY',
				folder: 'Daily Notes',
				template: undefined
			});
		});

		it('プラグインインスタンスが存在しない場合はフォールバック値を返す', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: true,
				// instance is missing
			});

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults).toEqual({
				dateFormat: 'YYYY-MM-DD',
				folder: 'Daily Notes',
				template: undefined
			});
			expect(logger.info).toHaveBeenCalledWith(
				'Daily Notes plugin found but settings not accessible, using fallback defaults'
			);
		});

		it('エラーが発生した場合はフォールバック値を返す', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockImplementation(() => {
				throw new Error('Plugin access error');
			});

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults).toEqual({
				dateFormat: 'YYYY-MM-DD',
				folder: 'Daily Notes',
				template: undefined
			});
			expect(logger.error).toHaveBeenCalledWith(
				'Error detecting Daily Notes plugin settings',
				expect.objectContaining({ error: expect.any(Error) })
			);
		});
	});

	describe('プラグイン利用可能性チェック', () => {
		it('プラグインが有効な場合はtrueを返す', () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: true
			});

			// Act & Assert
			expect(detector.isDailyNotesPluginAvailable()).toBe(true);
		});

		it('プラグインが無効な場合はfalseを返す', () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: false
			});

			// Act & Assert
			expect(detector.isDailyNotesPluginAvailable()).toBe(false);
		});

		it('プラグインが存在しない場合はfalseを返す', () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue(null);

			// Act & Assert
			expect(detector.isDailyNotesPluginAvailable()).toBe(false);
		});

		it('エラーが発生した場合はfalseを返す', () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockImplementation(() => {
				throw new Error('Plugin access error');
			});

			// Act & Assert
			expect(detector.isDailyNotesPluginAvailable()).toBe(false);
			expect(logger.debug).toHaveBeenCalledWith(
				'Error checking Daily Notes plugin availability',
				expect.objectContaining({ error: expect.any(Error) })
			);
		});
	});

	describe('推奨値の取得', () => {
		it('推奨日付フォーマットを返す', () => {
			// Act & Assert
			expect(detector.getRecommendedDateFormat()).toBe('YYYY-MM-DD');
		});

		it('推奨フォルダ名を返す', () => {
			// Act & Assert
			expect(detector.getRecommendedFolder()).toBe('Daily Notes');
		});
	});

	describe('テンプレートなしの設定検出', () => {
		it('テンプレートが空文字列の場合はundefinedを返す', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: true,
				instance: {
					options: {
						format: 'YYYY-MM-DD',
						folder: 'Daily',
						template: ''
					}
				}
			});

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults.template).toBeUndefined();
			expect(logger.info).toHaveBeenCalledWith('Daily Notes plugin settings detected', {
				dateFormat: 'YYYY-MM-DD',
				folder: 'Daily',
				template: 'none'
			});
		});

		it('テンプレートがnullの場合はundefinedを返す', async () => {
			// Arrange
			mockApp.internalPlugins.getPluginById.mockReturnValue({
				enabled: true,
				instance: {
					options: {
						format: 'YYYY-MM-DD',
						folder: 'Daily',
						template: null
					}
				}
			});

			// Act
			const defaults = await detector.detectDailyNotesDefaults();

			// Assert
			expect(defaults.template).toBeUndefined();
		});
	});
});