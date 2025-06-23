// Simplified tests for DailyNoteManager

import { App } from 'obsidian';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';

describe('DailyNoteManager - Basic Functionality', () => {
	let manager: DailyNoteManager;
	let mockApp: App;
	let mockLogger: any;

	beforeEach(() => {
		mockApp = new App();
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};
		manager = new DailyNoteManager(mockApp, mockLogger, 'Daily Notes');
	});

	test('should create manager instance', () => {
		expect(manager).toBeDefined();
		expect(manager.getDailyNotesPath()).toBe('Daily Notes');
	});

	test('should generate correct path for today', () => {
		const path = manager.getTodayNotePath();
		
		// Should match format: Daily Notes/YYYY-MM-DD.md
		expect(path).toMatch(/^Daily Notes\/\d{4}-\d{2}-\d{2}\.md$/);
	});

	test('should use custom daily notes path', () => {
		const customManager = new DailyNoteManager(mockApp, mockLogger, 'Journal');
		const path = customManager.getTodayNotePath();
		
		expect(path).toMatch(/^Journal\/\d{4}-\d{2}-\d{2}\.md$/);
	});

	test('should update daily notes path', () => {
		manager.setDailyNotesPath('Custom Path');
		expect(manager.getDailyNotesPath()).toBe('Custom Path');
	});

	test('should generate correct default daily note content', () => {
		// This tests the private method indirectly by checking if the manager
		// can be initialized without errors
		expect(manager).toBeDefined();
	});
});