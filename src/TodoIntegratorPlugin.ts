// Main Plugin Class for ToDo Integrator
// Manages plugin lifecycle, authentication, and synchronization

import { Plugin, Notice, TFile } from 'obsidian';
import { MSALAuthenticationManager } from './authentication/MSALAuthenticationManager';
import { TodoApiClient } from './api/TodoApiClient';
import { AuthenticationModal } from './ui/AuthenticationModal';
import { TodoIntegratorSettingsTab } from './ui/TodoIntegratorSettingsTab';
import { SidebarButton } from './ui/SidebarButton';
import { DailyNoteManager } from './sync/DailyNoteManager';
import { TodoSynchronizer } from './sync/TodoSynchronizer';
import { ErrorHandler } from './utils/ErrorHandler';
import { PluginSettings } from './settings/PluginSettings';
import { ObsidianTodoParser } from './parser/ObsidianTodoParser';
import {
	TodoIntegratorSettings,
	AuthenticationResult,
	SyncResult,
	UserInfo,
	Logger,
	TokenProvider,
	ErrorContext,
} from './types';
import { DEFAULT_SETTINGS, UI_TEXT, ERROR_CODES } from './constants';
import { SimpleLogger } from './utils/SimpleLogger';

export class TodoIntegratorPlugin extends Plugin {
	settings: TodoIntegratorSettings;
	authManager: MSALAuthenticationManager;
	apiClient: TodoApiClient;
	dailyNoteManager: DailyNoteManager;
	synchronizer: TodoSynchronizer;
	sidebarButton: SidebarButton;
	logger: Logger;
	errorHandler: ErrorHandler;
	pluginSettings: PluginSettings;
	todoParser: ObsidianTodoParser;
	private syncInterval: number | null = null;
	private currentAuthModal: AuthenticationModal | null = null;

	async onload(): Promise<void> {
		// Initialize logger
		this.logger = new SimpleLogger();
		this.logger.info('ToDo Integrator plugin loading...');

		// Initialize error handler
		this.errorHandler = new ErrorHandler(this.logger);

		// Initialize plugin settings manager
		this.pluginSettings = new PluginSettings(
			this.logger,
			this.errorHandler,
			() => this.loadData(),
			(data) => this.saveData(data)
		);

		// Load settings
		await this.loadSettings();
		if (this.settings?.logLevel) {
			this.logger.setLogLevel(this.settings.logLevel);
		}

		// Initialize core components
		this.initializeComponents();

		// Add UI elements
		this.addRibbonIcon('sync', UI_TEXT.SYNC.MANUAL_TRIGGER, () => {
			this.performManualSync();
		});

		this.addStatusBarItem().setText(UI_TEXT.PLUGIN_NAME);

		// Create sidebar button
		this.sidebarButton = new SidebarButton(
			this.app,
			() => this.performManualSync(),
			this.logger
		);

		// Add commands
		this.addCommands();

		// Add settings tab
		this.addSettingTab(new TodoIntegratorSettingsTab(this.app, this));

		// Initialize after authentication if already authenticated
		if (this.settings?.clientId && this.isAuthenticated()) {
			try {
				await this.initializeAfterAuth();
			} catch (error) {
				this.logger.error('Failed to initialize after authentication', { error });
			}
		}

		this.logger.info('ToDo Integrator plugin loaded successfully');
	}

	onunload(): void {
		if (this.logger) {
			this.logger.info('ToDo Integrator plugin unloading...');
		}
		
		// Clean up resources
		this.stopAutoSync();
		
		if (this.currentAuthModal) {
			this.currentAuthModal.close();
			this.currentAuthModal = null;
		}

		if (this.sidebarButton) {
			this.sidebarButton.destroy();
		}

		if (this.logger) {
			this.logger.info('ToDo Integrator plugin unloaded');
		}
	}

	private initializeComponents(): void {
		this.authManager = new MSALAuthenticationManager(this.logger);
		this.apiClient = new TodoApiClient(this.logger);
		this.todoParser = new ObsidianTodoParser(this.app, this.logger, this.errorHandler);
		this.dailyNoteManager = new DailyNoteManager(
			this.app, 
			this.logger, 
			this.settings?.dailyNotesPath || DEFAULT_SETTINGS.dailyNotesPath
		);
		this.synchronizer = new TodoSynchronizer(this.apiClient, this.dailyNoteManager, this.logger);
	}

	private addCommands(): void {
		// Manual sync command
		this.addCommand({
			id: 'sync-with-microsoft-todo',
			name: UI_TEXT.SYNC.MANUAL_TRIGGER,
			callback: () => this.performManualSync(),
		});

		// Authentication command
		this.addCommand({
			id: 'authenticate-microsoft',
			name: 'Authenticate with Microsoft',
			callback: () => this.authenticateWithMicrosoft(),
		});

		// Toggle auto-sync command
		this.addCommand({
			id: 'toggle-auto-sync',
			name: 'Toggle Auto-sync',
			callback: () => this.toggleAutoSync(),
		});
	}

	async loadSettings(): Promise<void> {
		try {
			if (this.pluginSettings) {
				this.settings = await this.pluginSettings.loadSettings();
			} else {
				const loadedSettings = await this.loadData();
				this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
			}
			this.logger?.debug('Settings loaded successfully', { settings: this.settings });
		} catch (error) {
			this.logger?.error('Failed to load settings', { error });
			this.settings = { ...DEFAULT_SETTINGS };
		}
	}

	async saveSettings(): Promise<void> {
		try {
			if (this.pluginSettings) {
				await this.pluginSettings.saveSettings(this.settings);
			} else {
				await this.saveData(this.settings);
			}
			this.logger?.debug('Settings saved successfully');
		} catch (error) {
			this.logger?.error('Failed to save settings', { error });
			throw error;
		}
	}

	async authenticateWithMicrosoft(): Promise<void> {
		if (!this.settings.clientId || !this.settings.tenantId) {
			new Notice('Please configure Client ID and Tenant ID in settings first.');
			return;
		}

		try {
			this.logger.info('Starting Microsoft authentication');

			// Initialize authentication manager
			await this.authManager.initialize(this.settings.clientId, this.settings.tenantId);

			// Show authentication modal
			this.currentAuthModal = new AuthenticationModal(this.app, () => {
				this.logger.info('Authentication cancelled by user');
			});
			this.currentAuthModal.open();

			// Perform authentication
			const result = await this.authManager.authenticate((deviceCode) => {
				if (this.currentAuthModal) {
					this.currentAuthModal.showDeviceCodeInstructions(deviceCode);
				}
			});

			// Get user info
			await this.initializeApiClient();
			const userInfo = await this.apiClient.getUserInfo();

			// Show success
			if (this.currentAuthModal) {
				this.currentAuthModal.showAuthenticationSuccess(userInfo);
			}

			new Notice(`Welcome, ${userInfo.displayName}! Authentication successful.`);

			// Update sidebar button auth status
			this.sidebarButton.updateAuthenticationStatus(true);

			// Initialize post-auth components
			await this.initializeAfterAuth();

			this.logger.info('Authentication completed successfully', {
				user: userInfo.displayName,
			});

		} catch (error) {
			this.logger.error('Authentication failed', { error });
			
			if (this.currentAuthModal) {
				this.currentAuthModal.showError(
					error instanceof Error ? error.message : 'Authentication failed'
				);
			}

			new Notice('Authentication failed. Please try again.');
			throw error;
		}
	}

	async initializeApiClient(): Promise<void> {
		if (!this.isAuthenticated()) {
			throw new Error('Authentication required before initializing API client');
		}

		const tokenProvider: TokenProvider = async () => {
			return await this.authManager.getAccessToken();
		};

		this.apiClient.initialize(tokenProvider);
		this.logger.info('API client initialized');
	}

	private async initializeAfterAuth(): Promise<void> {
		try {
			// Ensure API client is initialized
			if (!this.apiClient.isInitialized()) {
				await this.initializeApiClient();
			}

			// Set up or find task list
			const listId = await this.apiClient.getOrCreateTaskList(this.settings.todoListName);
			this.apiClient.setDefaultListId(listId);

			// Start auto-sync if enabled
			if (this.settings.autoSyncEnabled) {
				this.startAutoSync();
			}

			this.logger.info('Post-authentication initialization completed');

		} catch (error) {
			this.logger.error('Failed to initialize after authentication', { error });
			throw error;
		}
	}

	isAuthenticated(): boolean {
		return this.authManager?.isAuthenticated() || false;
	}

	async performManualSync(): Promise<void> {
		if (!this.isAuthenticated()) {
			new Notice('Please authenticate with Microsoft first.');
			return;
		}

		if (!this.apiClient.isInitialized()) {
			await this.initializeApiClient();
		}

		try {
			new Notice(UI_TEXT.SYNC.IN_PROGRESS);
			this.logger.info('Starting manual sync');

			// Update sidebar status
			this.sidebarButton.updateSyncStatus({
				status: 'syncing',
				message: 'Synchronizing tasks...',
			});

			const result = await this.performSync();

			const totalAdded = result.msftToObsidian.added + result.obsidianToMsft.added;
			const totalErrors = result.msftToObsidian.errors.length + 
							   result.obsidianToMsft.errors.length + 
							   result.completions.errors.length;

			if (totalErrors === 0) {
				new Notice(`${UI_TEXT.SYNC.SUCCESS}. Added ${totalAdded} tasks.`);
				this.sidebarButton.updateSyncStatus({
					status: 'success',
					message: `Added ${totalAdded} tasks`,
					lastSync: new Date().toISOString(),
				});
			} else {
				new Notice(`Sync completed with ${totalErrors} errors. Added ${totalAdded} tasks.`);
				this.sidebarButton.updateSyncStatus({
					status: 'error',
					message: `${totalErrors} errors occurred`,
					lastSync: new Date().toISOString(),
				});
			}

			// Update last sync time
			this.settings.lastSyncTime = new Date().toISOString();
			await this.saveSettings();

			this.logger.info('Manual sync completed', { result });

		} catch (error) {
			this.logger.error('Manual sync failed', { error });
			new Notice(`${UI_TEXT.SYNC.ERROR}: ${error instanceof Error ? error.message : 'Unknown error'}`);
			this.sidebarButton.updateSyncStatus({
				status: 'error',
				message: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	async performSync(): Promise<SyncResult> {
		this.logger.info('Performing synchronization');
		
		try {
			// Update daily note manager path if settings changed
			this.dailyNoteManager.setDailyNotesPath(this.settings.dailyNotesPath);
			
			// Perform full synchronization
			return await this.synchronizer.performFullSync();
		} catch (error) {
			this.logger.error('Synchronization failed', { error });
			throw error;
		}
	}

	private async toggleAutoSync(): Promise<void> {
		this.settings.autoSyncEnabled = !this.settings.autoSyncEnabled;
		await this.saveSettings();

		if (this.settings.autoSyncEnabled && this.isAuthenticated()) {
			this.startAutoSync();
			new Notice(UI_TEXT.SYNC.AUTO_SYNC_ENABLED);
		} else {
			this.stopAutoSync();
			new Notice(UI_TEXT.SYNC.AUTO_SYNC_DISABLED);
		}
	}

	private startAutoSync(): void {
		if (this.syncInterval) {
			this.stopAutoSync();
		}

		const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
		this.syncInterval = window.setInterval(() => {
			this.performManualSync();
		}, intervalMs);

		this.logger.info('Auto-sync started', {
			intervalMinutes: this.settings.syncIntervalMinutes,
		});
	}

	private stopAutoSync(): void {
		if (this.syncInterval) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
			this.logger.info('Auto-sync stopped');
		}
	}

	async updateSetting<K extends keyof TodoIntegratorSettings>(
		key: K,
		value: TodoIntegratorSettings[K]
	): Promise<void> {
		this.settings[key] = value;
		await this.saveSettings();

		// Handle setting-specific logic
		if (key === 'logLevel') {
			this.logger.setLogLevel(value as any);
		} else if (key === 'autoSyncEnabled') {
			if (value && this.isAuthenticated()) {
				this.startAutoSync();
			} else {
				this.stopAutoSync();
			}
		} else if (key === 'syncIntervalMinutes' && this.settings.autoSyncEnabled) {
			this.startAutoSync(); // Restart with new interval
		}
	}

	getAuthenticationStatus(): {
		isAuthenticated: boolean;
		userInfo?: UserInfo;
	} {
		const isAuth = this.isAuthenticated();
		return {
			isAuthenticated: isAuth,
			// userInfo will be available after authentication
		};
	}

	async logout(): Promise<void> {
		try {
			await this.authManager.logout();
			this.stopAutoSync();
			
			// Reset API client
			this.apiClient = new TodoApiClient(this.logger);
			
			// Update sidebar button
			this.sidebarButton.updateAuthenticationStatus(false);
			this.sidebarButton.updateSyncStatus({ status: 'idle' });
			
			new Notice('Logged out successfully');
			this.logger.info('User logged out');

		} catch (error) {
			this.logger.error('Logout failed', { error });
			new Notice('Logout failed');
		}
	}
}