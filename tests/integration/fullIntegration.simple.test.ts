// Simplified Full Integration Tests for ToDo Integrator Plugin

import { App } from 'obsidian';
import { TodoIntegratorPlugin } from '../../src/TodoIntegratorPlugin';

// Mock DailyNotesDetector to prevent it from overriding test settings
jest.mock('../../src/utils/DailyNotesDetector', () => ({
	DailyNotesDetector: jest.fn().mockImplementation(() => ({
		detectDailyNotesDefaults: jest.fn().mockResolvedValue({
			dateFormat: 'YYYY-MM-DD',
			folder: 'Daily Notes',
			template: undefined,
		}),
		isDailyNotesPluginAvailable: jest.fn().mockReturnValue(false),
	})),
}));

describe('Full Integration Tests - Basic', () => {
	let plugin: TodoIntegratorPlugin;
	let mockApp: App;

	beforeEach(() => {
		mockApp = new App();
		plugin = new TodoIntegratorPlugin(mockApp, {
			id: 'todo-integrator',
			name: 'ToDo Integrator',
			version: '0.1.4',
			author: 'Test Author',
			minAppVersion: '0.15.0',
			description: 'Test plugin'
		});
	});

	test('should create plugin instance', () => {
		expect(plugin).toBeDefined();
		expect(plugin.app).toBe(mockApp);
	});

	test('should handle basic lifecycle without errors', () => {
		expect(() => plugin.onunload()).not.toThrow();
	});

	test('should have default authentication status', () => {
		expect(plugin.isAuthenticated()).toBe(false);
		
		const authStatus = plugin.getAuthenticationStatus();
		expect(authStatus.isAuthenticated).toBe(false);
	});

	test('should load and initialize all components', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		
		await plugin.onload();
		
		// Verify core components exist
		expect(plugin.authManager).toBeDefined();
		expect(plugin.apiClient).toBeDefined();
		expect(plugin.dailyNoteManager).toBeDefined();
		expect(plugin.synchronizer).toBeDefined();
		expect(plugin.sidebarButton).toBeDefined();
	});

	test('should register UI elements', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		
		await plugin.onload();
		
		// Verify UI registration calls
		expect(plugin.addRibbonIcon).toHaveBeenCalled();
		expect(plugin.addStatusBarItem).toHaveBeenCalled();
		expect(plugin.addCommand).toHaveBeenCalled();
		expect(plugin.addSettingTab).toHaveBeenCalled();
	});

	test('should handle manual sync gracefully when not authenticated', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		await plugin.onload();
		
		// Should not throw when trying to sync without authentication
		await expect(plugin.performManualSync()).resolves.not.toThrow();
	});

	test('should validate component dependencies', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		await plugin.onload();
		
		// Verify synchronizer has access to required components
		expect(plugin.synchronizer).toBeDefined();
		expect(plugin.dailyNoteManager).toBeDefined();
		expect(plugin.apiClient).toBeDefined();
	});

	test('should handle settings operations', async () => {
		const testSettings = {
			clientId: 'test-client-id',
			todoListName: 'Test List',
		};
		
		plugin.loadData = jest.fn().mockResolvedValue(testSettings);
		plugin.saveData = jest.fn().mockResolvedValue(undefined);
		// Disable pluginSettings to use direct loadData()
		plugin.pluginSettings = null as any;
		
		await plugin.loadSettings();
		
		expect(plugin.settings.clientId).toBe('test-client-id');
		expect(plugin.settings.todoListName).toBe('Test List');
		expect(plugin.settings.tenantId).toBe('common'); // default value
		expect(plugin.settings.dailyNotesPath).toBe('Daily Notes');
	});
});