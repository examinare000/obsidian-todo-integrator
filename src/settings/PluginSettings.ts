// Plugin Settings Manager for ToDo Integrator
// Provides robust settings validation and configuration management

import { TodoIntegratorSettings } from '../types';
import { Logger } from '../types';
import { ErrorHandler } from '../utils/ErrorHandler';
import { getAzureConfig, PLUGIN_CONFIG } from '../config/AppConfig';
import { DEFAULT_SETTINGS } from '../constants';

export class PluginSettings {
	private settings: TodoIntegratorSettings;
	private logger: Logger;
	private errorHandler: ErrorHandler;
	private loadDataCallback: () => Promise<any>;
	private saveDataCallback: (data: any) => Promise<void>;

	constructor(
		logger: Logger,
		errorHandler: ErrorHandler,
		loadDataCallback: () => Promise<any>,
		saveDataCallback: (data: any) => Promise<void>
	) {
		this.settings = { ...DEFAULT_SETTINGS };
		this.logger = logger;
		this.errorHandler = errorHandler;
		this.loadDataCallback = loadDataCallback;
		this.saveDataCallback = saveDataCallback;
	}

	async loadSettings(): Promise<TodoIntegratorSettings> {
		try {
			const data = await this.loadDataCallback();
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
			this.logger.debug('Settings loaded successfully');
			return this.settings;
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			this.logger.error(`Failed to load settings: ${errorMessage}`, error);
			this.settings = { ...DEFAULT_SETTINGS };
			return this.settings;
		}
	}

	async saveSettings(settings?: TodoIntegratorSettings): Promise<void> {
		try {
			const settingsToSave = settings || this.settings;
			const validatedSettings = this.validateSettings(settingsToSave);
			this.settings = validatedSettings;
			
			// loadDataCallbackがあれば、既存のデータを取得してメタデータを保護
			if (this.loadDataCallback) {
				const existingData = await this.loadDataCallback() || {};
				const metadataKey = 'todo-integrator-task-metadata';
				
				// メタデータが存在する場合は保持
				const protectedData = { ...this.settings } as any;
				if (existingData[metadataKey]) {
					protectedData[metadataKey] = existingData[metadataKey];
				}
				
				await this.saveDataCallback(protectedData);
			} else {
				await this.saveDataCallback(this.settings);
			}
			
			this.logger.debug('Settings saved successfully');
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			this.logger.error(`Failed to save settings: ${errorMessage}`, error);
			throw new Error(`Failed to save settings: ${errorMessage}`);
		}
	}

	validateSettings(settings: TodoIntegratorSettings): TodoIntegratorSettings {
		const validated = { ...settings };

		// Skip auto-population in test environment
		if (process.env.NODE_ENV !== 'test') {
			// Auto-populate Client ID from Azure config if empty
			if (!validated.clientId || validated.clientId.trim().length === 0) {
				const azureConfig = getAzureConfig();
				validated.clientId = azureConfig.CLIENT_ID;
				this.logger.info('Auto-populated Client ID from Azure configuration');
			}

			// Auto-populate Tenant ID from Azure config if empty
			if (!validated.tenantId || validated.tenantId.trim().length === 0) {
				const azureConfig = getAzureConfig();
				validated.tenantId = azureConfig.TENANT_ID;
				this.logger.info('Auto-populated Tenant ID from Azure configuration');
			}
		}

		// Validate Daily Note path
		if (!this.validateDailyNotePath(validated.dailyNotesPath)) {
			this.logger.error('Invalid Daily Note path, using default');
			validated.dailyNotesPath = PLUGIN_CONFIG.DEFAULT_DAILY_NOTES_PATH;
		}

		// Validate sync interval (minimum 1 minute)
		if (validated.syncIntervalMinutes < PLUGIN_CONFIG.MIN_SYNC_INTERVAL_MINUTES) {
			validated.syncIntervalMinutes = PLUGIN_CONFIG.MIN_SYNC_INTERVAL_MINUTES;
			this.logger.info('Sync interval adjusted to minimum 1 minute');
		}

		if (validated.syncIntervalMinutes > PLUGIN_CONFIG.MAX_SYNC_INTERVAL_MINUTES) {
			validated.syncIntervalMinutes = PLUGIN_CONFIG.MAX_SYNC_INTERVAL_MINUTES;
			this.logger.info('Sync interval adjusted to maximum 24 hours');
		}

		// Validate log level
		if (!['debug', 'info', 'warn', 'error'].includes(validated.logLevel)) {
			validated.logLevel = 'info';
		}

		// Validate todo list name
		if (!validated.todoListName || validated.todoListName.trim().length === 0) {
			validated.todoListName = PLUGIN_CONFIG.DEFAULT_TODO_LIST_NAME;
		}

		return validated;
	}

	getDefaultSettings(): TodoIntegratorSettings {
		return { ...DEFAULT_SETTINGS };
	}

	validateDailyNotePath(path: string): boolean {
		if (!path || path.trim().length === 0) {
			return false;
		}

		// Check for invalid characters
		const invalidChars = /[<>:"|?*]/;
		if (invalidChars.test(path)) {
			return false;
		}

		// Path should not start or end with spaces
		if (path !== path.trim()) {
			return false;
		}

		return true;
	}

	getCurrentSettings(): TodoIntegratorSettings {
		return { ...this.settings };
	}

	updateSetting<K extends keyof TodoIntegratorSettings>(
		key: K, 
		value: TodoIntegratorSettings[K]
	): void {
		this.settings[key] = value;
	}

	getDailyNoteConfig(): { 
		dailyNotesPath: string; 
		todoSectionHeader: string; 
	} {
		return {
			dailyNotesPath: this.settings.dailyNotesPath,
			todoSectionHeader: 'Tasks'
		};
	}

	getSyncConfig(): { 
		syncIntervalMinutes: number; 
		autoSyncEnabled: boolean; 
	} {
		return {
			syncIntervalMinutes: this.settings.syncIntervalMinutes,
			autoSyncEnabled: this.settings.autoSyncEnabled
		};
	}

	getClientConfig(): { 
		clientId: string; 
		tenantId: string; 
	} {
		return {
			clientId: this.settings.clientId,
			tenantId: this.settings.tenantId
		};
	}

	getTodoListConfig(): {
		todoListName: string;
	} {
		return {
			todoListName: this.settings.todoListName
		};
	}

	getLogConfig(): {
		logLevel: 'debug' | 'info' | 'warn' | 'error';
	} {
		return {
			logLevel: this.settings.logLevel
		};
	}

	// Helper methods for common validation checks
	isValidClientId(clientId: string): boolean {
		// UUID format check for Azure client IDs
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		return uuidRegex.test(clientId);
	}

	isValidTenantId(tenantId: string): boolean {
		// Common Azure tenant types or UUID format
		const validTenants = ['common', 'organizations', 'consumers'];
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		
		return validTenants.includes(tenantId) || uuidRegex.test(tenantId);
	}

	getValidationErrors(): string[] {
		const errors: string[] = [];
		const settings = this.settings;

		if (!this.isValidClientId(settings.clientId)) {
			errors.push('Invalid Client ID format');
		}

		if (!this.isValidTenantId(settings.tenantId)) {
			errors.push('Invalid Tenant ID format');
		}

		if (!this.validateDailyNotePath(settings.dailyNotesPath)) {
			errors.push('Invalid Daily Notes path');
		}

		if (settings.syncIntervalMinutes < PLUGIN_CONFIG.MIN_SYNC_INTERVAL_MINUTES) {
			errors.push('Sync interval too short (minimum 1 minute)');
		}

		if (settings.syncIntervalMinutes > PLUGIN_CONFIG.MAX_SYNC_INTERVAL_MINUTES) {
			errors.push('Sync interval too long (maximum 24 hours)');
		}

		return errors;
	}

	resetToDefaults(): void {
		this.settings = { ...DEFAULT_SETTINGS };
		this.logger.info('Settings reset to defaults');
	}
}