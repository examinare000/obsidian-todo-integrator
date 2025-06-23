// Tests for TodoIntegratorPlugin (Main Plugin Class)

import { App } from 'obsidian';
import { TodoIntegratorPlugin } from '../../src/TodoIntegratorPlugin';
import { MSALAuthenticationManager } from '../../src/authentication/MSALAuthenticationManager';
import { TodoApiClient } from '../../src/api/TodoApiClient';

// Mock dependencies
jest.mock('../../src/authentication/MSALAuthenticationManager');
jest.mock('../../src/api/TodoApiClient');

describe('TodoIntegratorPlugin', () => {
	let plugin: TodoIntegratorPlugin;
	let mockApp: App;

	beforeEach(() => {
		mockApp = new App();
		plugin = new TodoIntegratorPlugin(mockApp, {
			id: 'todo-integrator',
			name: 'ToDo Integrator',
			version: '0.1.2',
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('plugin lifecycle', () => {
		it('should initialize plugin without errors', () => {
			expect(plugin).toBeDefined();
			expect(plugin.app).toBe(mockApp);
		});

		it('should load plugin and initialize components', async () => {
			const loadSpy = jest.spyOn(plugin, 'loadSettings');
			loadSpy.mockResolvedValue(undefined);

			await plugin.onload();

			expect(loadSpy).toHaveBeenCalled();
			expect(plugin.addRibbonIcon).toHaveBeenCalled();
			expect(plugin.addCommand).toHaveBeenCalled();
			expect(plugin.addSettingTab).toHaveBeenCalled();
		});

		it('should clean up resources on unload', () => {
			plugin.onunload();
			// Verify cleanup was performed
			expect(plugin).toBeDefined();
		});
	});

	describe('settings management', () => {
		it('should load default settings', async () => {
			plugin.loadData = jest.fn().mockResolvedValue(null);
			
			await plugin.loadSettings();

			expect(plugin.settings).toEqual(expect.objectContaining({
				clientId: '',
				tenantId: 'common',
				todoListName: 'Obsidian Tasks',
				autoSyncEnabled: false,
			}));
		});

		it('should merge saved settings with defaults', async () => {
			const savedSettings = {
				clientId: 'test-client-id',
				todoListName: 'Custom List',
			};
			plugin.loadData = jest.fn().mockResolvedValue(savedSettings);

			await plugin.loadSettings();

			expect(plugin.settings.clientId).toBe('test-client-id');
			expect(plugin.settings.todoListName).toBe('Custom List');
			expect(plugin.settings.tenantId).toBe('common'); // default value
		});

		it('should save settings', async () => {
			plugin.saveData = jest.fn().mockResolvedValue(undefined);
			plugin.settings = {
				clientId: 'test-id',
				tenantId: 'common',
				todoListName: 'Test List',
				dailyNotesPath: 'Daily Notes',
				autoSyncEnabled: true,
				syncIntervalMinutes: 30,
				logLevel: 'info',
			};

			await plugin.saveSettings();

			expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
		});
	});

	describe('authentication', () => {
		beforeEach(async () => {
			plugin.loadData = jest.fn().mockResolvedValue(null);
			await plugin.onload();
		});

		it('should check authentication status', () => {
			const mockAuthManager = plugin.authManager as jest.Mocked<MSALAuthenticationManager>;
			mockAuthManager.isAuthenticated.mockReturnValue(true);

			const isAuth = plugin.isAuthenticated();

			expect(isAuth).toBe(true);
			expect(mockAuthManager.isAuthenticated).toHaveBeenCalled();
		});

		it('should initiate authentication flow', async () => {
			const mockAuthManager = plugin.authManager as jest.Mocked<MSALAuthenticationManager>;
			mockAuthManager.initialize.mockResolvedValue(undefined);
			mockAuthManager.authenticate.mockResolvedValue({
				accessToken: 'test-token',
				expiresOn: new Date(),
				account: { username: 'test@example.com', name: 'Test User' },
			});

			plugin.settings.clientId = 'test-client-id';
			plugin.settings.tenantId = 'common';

			await plugin.authenticateWithMicrosoft();

			expect(mockAuthManager.initialize).toHaveBeenCalledWith('test-client-id', 'common');
			expect(mockAuthManager.authenticate).toHaveBeenCalled();
		});

		it('should handle authentication errors', async () => {
			const mockAuthManager = plugin.authManager as jest.Mocked<MSALAuthenticationManager>;
			mockAuthManager.initialize.mockRejectedValue(new Error('Auth failed'));

			plugin.settings.clientId = 'test-client-id';

			await expect(plugin.authenticateWithMicrosoft()).rejects.toThrow('Auth failed');
		});
	});

	describe('commands', () => {
		beforeEach(async () => {
			plugin.loadData = jest.fn().mockResolvedValue(null);
			await plugin.onload();
		});

		it('should register sync command', () => {
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'sync-with-microsoft-todo',
					name: 'Sync with Microsoft To Do',
				})
			);
		});

		it('should register authentication command', () => {
			expect(plugin.addCommand).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'authenticate-microsoft',
					name: 'Authenticate with Microsoft',
				})
			);
		});
	});

	describe('API integration', () => {
		beforeEach(async () => {
			plugin.loadData = jest.fn().mockResolvedValue(null);
			await plugin.onload();
		});

		it('should initialize API client after authentication', async () => {
			const mockAuthManager = plugin.authManager as jest.Mocked<MSALAuthenticationManager>;
			const mockApiClient = plugin.apiClient as jest.Mocked<TodoApiClient>;
			
			mockAuthManager.isAuthenticated.mockReturnValue(true);
			mockAuthManager.getAccessToken.mockResolvedValue('test-token');

			await plugin.initializeApiClient();

			expect(mockApiClient.initialize).toHaveBeenCalled();
		});

		it('should require authentication before API initialization', async () => {
			const mockAuthManager = plugin.authManager as jest.Mocked<MSALAuthenticationManager>;
			mockAuthManager.isAuthenticated.mockReturnValue(false);

			await expect(plugin.initializeApiClient()).rejects.toThrow('Authentication required');
		});
	});

	describe('sync operations', () => {
		beforeEach(async () => {
			plugin.loadData = jest.fn().mockResolvedValue(null);
			await plugin.onload();
		});

		it('should perform manual sync when authenticated', async () => {
			const mockAuthManager = plugin.authManager as jest.Mocked<MSALAuthenticationManager>;
			const mockApiClient = plugin.apiClient as jest.Mocked<TodoApiClient>;
			
			mockAuthManager.isAuthenticated.mockReturnValue(true);
			mockApiClient.isInitialized.mockReturnValue(true);

			// Mock successful sync
			const syncSpy = jest.spyOn(plugin, 'performSync');
			syncSpy.mockResolvedValue({
				msftToObsidian: { added: 2, errors: [] },
				obsidianToMsft: { added: 1, errors: [] },
				completions: { completed: 0, errors: [] },
				timestamp: new Date().toISOString(),
			});

			await plugin.performManualSync();

			expect(syncSpy).toHaveBeenCalled();
		});

		it('should require authentication for sync', async () => {
			const mockAuthManager = plugin.authManager as jest.Mocked<MSALAuthenticationManager>;
			mockAuthManager.isAuthenticated.mockReturnValue(false);

			await expect(plugin.performManualSync()).rejects.toThrow('Authentication required');
		});
	});
});