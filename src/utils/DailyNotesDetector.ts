// Daily Notes Plugin Detection and Settings Extraction
// Detects if Daily Notes plugin is installed and extracts default values

import { App } from 'obsidian';
import { Logger } from '../types';

export interface DailyNotesDefaults {
	dateFormat: string;
	folder: string;
	template?: string;
}

export class DailyNotesDetector {
	private app: App;
	private logger: Logger;

	constructor(app: App, logger: Logger) {
		this.app = app;
		this.logger = logger;
	}

	/**
	 * Attempts to detect Daily Notes plugin settings and extract default values
	 * Returns fallback defaults if plugin is not installed or settings are not accessible
	 */
	async detectDailyNotesDefaults(): Promise<DailyNotesDefaults> {
		const fallbackDefaults: DailyNotesDefaults = {
			dateFormat: 'YYYY-MM-DD',
			folder: 'Daily Notes',
			template: undefined,
		};

		try {
			// Check if Daily Notes plugin is enabled
			const plugins = (this.app as any).internalPlugins;
			const dailyNotesPlugin = plugins?.getPluginById('daily-notes');

			if (!dailyNotesPlugin || !dailyNotesPlugin.enabled) {
				this.logger.info('Daily Notes plugin not found or not enabled, using fallback defaults');
				return fallbackDefaults;
			}

			// Try to access plugin settings via internal API
			const pluginInstance = dailyNotesPlugin.instance;
			if (pluginInstance && pluginInstance.options) {
				const options = pluginInstance.options;
				
				const detectedDefaults: DailyNotesDefaults = {
					dateFormat: options.format || fallbackDefaults.dateFormat,
					folder: options.folder || fallbackDefaults.folder,
					template: options.template || undefined,
				};

				this.logger.info('Daily Notes plugin settings detected', {
					dateFormat: detectedDefaults.dateFormat,
					folder: detectedDefaults.folder,
					template: detectedDefaults.template || 'none',
				});

				return detectedDefaults;
			}

			this.logger.info('Daily Notes plugin found but settings not accessible, using fallback defaults');
			return fallbackDefaults;

		} catch (error) {
			this.logger.error('Error detecting Daily Notes plugin settings', { error });
			return fallbackDefaults;
		}
	}

	/**
	 * Checks if Daily Notes plugin is installed and enabled
	 */
	isDailyNotesPluginAvailable(): boolean {
		try {
			const plugins = (this.app as any).internalPlugins;
			const dailyNotesPlugin = plugins?.getPluginById('daily-notes');
			return dailyNotesPlugin?.enabled || false;
		} catch (error) {
			this.logger.debug('Error checking Daily Notes plugin availability', { error });
			return false;
		}
	}

	/**
	 * Gets the default date format based on various sources
	 */
	getRecommendedDateFormat(): string {
		// Common date formats in order of preference
		const formats = [
			'YYYY-MM-DD',    // ISO format (default)
			'DD-MM-YYYY',    // European format
			'MM-DD-YYYY',    // US format
			'YYYY/MM/DD',    // Alternative ISO
			'DD/MM/YYYY',    // Alternative European
			'MM/DD/YYYY',    // Alternative US
		];

		return formats[0]; // Return ISO format as default
	}

	/**
	 * Gets the default folder name for daily notes
	 */
	getRecommendedFolder(): string {
		return 'Daily Notes';
	}
}