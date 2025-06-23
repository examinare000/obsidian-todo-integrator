// Simplified tests for TodoSynchronizer

import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { TodoApiClient } from '../../src/api/TodoApiClient';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';

// Mock dependencies
jest.mock('../../src/api/TodoApiClient');
jest.mock('../../src/sync/DailyNoteManager');

describe('TodoSynchronizer - Basic Functionality', () => {
	let synchronizer: TodoSynchronizer;
	let mockApiClient: jest.Mocked<TodoApiClient>;
	let mockDailyNoteManager: jest.Mocked<DailyNoteManager>;
	let mockLogger: any;

	beforeEach(() => {
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};

		mockApiClient = {
			getTasks: jest.fn(),
			createTask: jest.fn(),
			completeTask: jest.fn(),
			getDefaultListId: jest.fn(),
		} as any;

		mockDailyNoteManager = {
			ensureTodayNoteExists: jest.fn(),
			getDailyNoteTasks: jest.fn(),
			addTaskToTodoSection: jest.fn(),
			updateTaskCompletion: jest.fn(),
			getTodayNotePath: jest.fn(),
		} as any;

		synchronizer = new TodoSynchronizer(
			mockApiClient,
			mockDailyNoteManager,
			mockLogger
		);
	});

	test('should create synchronizer instance', () => {
		expect(synchronizer).toBeDefined();
	});

	test('should detect duplicates by title', () => {
		const obsidianTasks: any[] = [
			{ title: 'Task 1', todoId: undefined },
			{ title: 'Task 2', todoId: 'msft-2' },
		];

		const msftTasks: any[] = [
			{ id: 'msft-1', title: 'Task 1' },
			{ id: 'msft-2', title: 'Task 2' },
			{ id: 'msft-3', title: 'Task 3' },
		];

		const duplicates = synchronizer.detectDuplicates(obsidianTasks, msftTasks);

		expect(duplicates).toHaveLength(1);
		expect(duplicates[0]).toEqual({
			obsidianTask: obsidianTasks[0],
			msftTask: msftTasks[0],
			confidence: 1.0,
		});
	});

	test('should handle empty task lists', () => {
		const duplicates = synchronizer.detectDuplicates([], []);
		expect(duplicates).toHaveLength(0);
	});

	test('should ignore case differences in titles', () => {
		const obsidianTasks: any[] = [
			{ title: 'TASK ONE', todoId: undefined },
		];

		const msftTasks: any[] = [
			{ id: 'msft-1', title: 'task one' },
		];

		const duplicates = synchronizer.detectDuplicates(obsidianTasks, msftTasks);

		expect(duplicates).toHaveLength(1);
	});
});