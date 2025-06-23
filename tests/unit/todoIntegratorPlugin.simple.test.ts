// Simplified tests for TodoIntegratorPlugin

import { App } from 'obsidian';
import { TodoIntegratorPlugin } from '../../src/TodoIntegratorPlugin';

describe('TodoIntegratorPlugin - Basic Functionality', () => {
	let plugin: TodoIntegratorPlugin;
	let mockApp: App;

	beforeEach(() => {
		mockApp = new App();
		plugin = new TodoIntegratorPlugin(mockApp, {
			id: 'todo-integrator',
			name: 'ToDo Integrator',
			version: '0.1.2',
			author: 'Test Author',
			minAppVersion: '1.0.0',
			description: 'Test plugin for unit testing',
		});
	});

	test('should create plugin instance', () => {
		expect(plugin).toBeDefined();
		expect(plugin.app).toBe(mockApp);
	});

	test('should have default settings structure', async () => {
		plugin.loadData = jest.fn().mockResolvedValue(null);
		
		await plugin.loadSettings();

		expect(plugin.settings).toBeDefined();
		expect(plugin.settings).toHaveProperty('clientId');
		expect(plugin.settings).toHaveProperty('tenantId');
		expect(plugin.settings).toHaveProperty('todoListName');
		expect(plugin.settings).toHaveProperty('autoSyncEnabled');
	});

	test('should not be authenticated initially', () => {
		expect(plugin.isAuthenticated()).toBe(false);
	});

	test('should handle missing authentication gracefully', async () => {
		// Should not throw when checking auth status
		const authStatus = plugin.getAuthenticationStatus();
		expect(authStatus.isAuthenticated).toBe(false);
	});

	test('should handle onunload without errors', () => {
		expect(() => plugin.onunload()).not.toThrow();
	});
});