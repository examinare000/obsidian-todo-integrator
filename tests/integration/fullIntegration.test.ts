// Full Integration Tests for ToDo Integrator Plugin

import { App } from 'obsidian';
import { TodoIntegratorPlugin } from '../../src/TodoIntegratorPlugin';
import { SimpleLogger } from '../../src/utils/SimpleLogger';

describe('Full Integration Tests', () => {
	let plugin: TodoIntegratorPlugin;
	let mockApp: App;

	beforeEach(() => {
		mockApp = new App();
		plugin = new TodoIntegratorPlugin(mockApp, {
			id: 'todo-integrator',
			name: 'ToDo Integrator',
			version: '0.1.4',
			author: 'Test Author',
			minAppVersion: '1.0.0',
			description: 'Test plugin for integration testing',
		});
	});

	test('should load plugin without errors', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		
		await expect(plugin.onload()).resolves.not.toThrow();
		
		// Verify all components are initialized
		expect(plugin.authManager).toBeDefined();
		expect(plugin.apiClient).toBeDefined();
		expect(plugin.dailyNoteManager).toBeDefined();
		expect(plugin.synchronizer).toBeDefined();
		expect(plugin.sidebarButton).toBeDefined();
		expect(plugin.logger).toBeDefined();
	});

	test('should unload plugin without errors', () => {
		expect(() => plugin.onunload()).not.toThrow();
	});

	test('should handle settings operations', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({
			clientId: 'test-client-id',
			todoListName: 'Test List',
		});
		plugin.saveData = jest.fn().mockResolvedValue(undefined);
		
		await plugin.loadSettings();
		
		expect(plugin.settings.clientId).toBe('test-client-id');
		expect(plugin.settings.todoListName).toBe('Test List');
		expect(plugin.settings.tenantId).toBe('common'); // default value
		
		await plugin.updateSetting('autoSyncEnabled', true);
		
		expect(plugin.settings.autoSyncEnabled).toBe(true);
		expect(plugin.saveData).toHaveBeenCalled();
	});

	test('should initialize logger correctly', () => {
		expect(plugin.logger).toBeInstanceOf(SimpleLogger);
	});

	test('should handle authentication status correctly', () => {
		// Initially not authenticated
		expect(plugin.isAuthenticated()).toBe(false);
		
		const authStatus = plugin.getAuthenticationStatus();
		expect(authStatus.isAuthenticated).toBe(false);
	});

	test('should create all UI components', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		
		await plugin.onload();
		
		// Verify UI components are initialized
		expect(plugin.addRibbonIcon).toHaveBeenCalled();
		expect(plugin.addStatusBarItem).toHaveBeenCalled();
		expect(plugin.addCommand).toHaveBeenCalled();
		expect(plugin.addSettingTab).toHaveBeenCalled();
	});

	test('should handle sync operations gracefully when not authenticated', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		await plugin.onload();
		
		// Should not throw when trying to sync without authentication
		await expect(plugin.performManualSync()).resolves.not.toThrow();
	});

	test('should validate component integration', async () => {
		plugin.loadData = jest.fn().mockResolvedValue({});
		await plugin.onload();
		
		// Verify components can communicate
		expect(plugin.synchronizer).toBeDefined();
		expect(plugin.dailyNoteManager).toBeDefined();
		expect(plugin.apiClient).toBeDefined();
		
		// Verify synchronizer has correct dependencies
		expect(plugin.synchronizer['apiClient']).toBe(plugin.apiClient);
		expect(plugin.synchronizer['dailyNoteManager']).toBe(plugin.dailyNoteManager);
	});
});