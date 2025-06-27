import { App, Plugin } from 'obsidian';
import { DataViewSettings, Logger } from '../types';

/**
 * DataView compatibility helper
 * Checks for DataView plugin and respects its completion format settings
 */
export class DataViewCompat {
	private app: App;
	private logger: Logger;
	private dataViewSettings: DataViewSettings | null = null;
	private isDataViewAvailable: boolean = false;

	constructor(app: App, logger: Logger) {
		this.app = app;
		this.logger = logger;
		this.checkDataViewPlugin();
	}

	/**
	 * Check if DataView plugin is installed and enabled
	 */
	private checkDataViewPlugin(): void {
		try {
			// Check if DataView plugin is loaded
			const dataviewPlugin = (this.app as any).plugins?.plugins?.dataview;
			
			if (dataviewPlugin && dataviewPlugin.manifest) {
				this.isDataViewAvailable = true;
				this.logger.info('DataView plugin detected', {
					version: dataviewPlugin.manifest.version
				});
				
				// Try to load DataView settings
				this.loadDataViewSettings();
			} else {
				this.logger.debug('DataView plugin not found');
			}
		} catch (error) {
			this.logger.error('Error checking DataView plugin', { error });
		}
	}

	/**
	 * Load DataView plugin settings
	 */
	private async loadDataViewSettings(): Promise<void> {
		try {
			const dataviewPlugin = (this.app as any).plugins?.plugins?.dataview;
			if (!dataviewPlugin) return;

			// DataView stores settings in its plugin data
			const settings = dataviewPlugin.settings;
			if (settings) {
				this.dataViewSettings = {
					taskCompletionTracking: settings.taskCompletionTracking,
					taskCompletionUseEmojiShorthand: settings.taskCompletionUseEmojiShorthand,
					taskCompletionText: settings.taskCompletionText,
					taskCompletionDateFormat: settings.taskCompletionDateFormat
				};
				
				this.logger.debug('DataView settings loaded', {
					useEmojiShorthand: this.dataViewSettings.taskCompletionUseEmojiShorthand,
					completionText: this.dataViewSettings.taskCompletionText
				});
			}
		} catch (error) {
			this.logger.error('Error loading DataView settings', { error });
		}
	}

	/**
	 * Get completion format based on DataView settings
	 * @param date - The completion date in YYYY-MM-DD format
	 * @returns The formatted completion string
	 */
	getCompletionFormat(date: string): string {
		// If DataView is not available or emoji shorthand is disabled, use default format
		if (!this.isDataViewAvailable || !this.dataViewSettings?.taskCompletionUseEmojiShorthand) {
			return ` ✅ ${date}`;
		}

		// Use DataView's completion text format
		const completionText = this.dataViewSettings.taskCompletionText || '✅';
		
		// If DataView has custom date format, we would need to format the date accordingly
		// For now, we'll use the standard format
		return ` ${completionText} ${date}`;
	}

	/**
	 * Check if we should use emoji shorthand format
	 */
	shouldUseEmojiShorthand(): boolean {
		return this.isDataViewAvailable && 
			   this.dataViewSettings?.taskCompletionUseEmojiShorthand === true;
	}

	/**
	 * Parse completion date from task text
	 * Handles both DataView format and default format
	 */
	parseCompletionDate(taskText: string): string | null {
		// Try to match emoji format (e.g., "✅ 2024-01-01")
		const emojiMatch = taskText.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
		if (emojiMatch) {
			return emojiMatch[1];
		}

		// Try to match DataView format with custom completion text
		if (this.dataViewSettings?.taskCompletionText) {
			const customTextRegex = new RegExp(`${this.escapeRegex(this.dataViewSettings.taskCompletionText)}\\s*(\\d{4}-\\d{2}-\\d{2})`);
			const customMatch = taskText.match(customTextRegex);
			if (customMatch) {
				return customMatch[1];
			}
		}

		// Try to match DataView inline field format [completion:: 2024-01-01]
		const inlineMatch = taskText.match(/\[completion::\s*(\d{4}-\d{2}-\d{2})\]/);
		if (inlineMatch) {
			return inlineMatch[1];
		}

		return null;
	}

	/**
	 * Escape special regex characters
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Refresh DataView settings (call when settings might have changed)
	 */
	async refreshSettings(): Promise<void> {
		if (this.isDataViewAvailable) {
			await this.loadDataViewSettings();
		}
	}
}