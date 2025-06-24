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
			app: {
				vault: {
					getAbstractFileByPath: jest.fn().mockReturnValue(null),
					create: jest.fn().mockResolvedValue(undefined),
					read: jest.fn().mockResolvedValue(''),
					modify: jest.fn().mockResolvedValue(undefined),
				}
			}
		} as any;

		const mockPlugin = {
			loadData: jest.fn().mockResolvedValue({}),
			saveData: jest.fn().mockResolvedValue(undefined)
		} as any;
		
		synchronizer = new TodoSynchronizer(
			mockApiClient,
			mockDailyNoteManager,
			mockLogger,
			undefined,
			mockPlugin
		);
		
		// Mock the metadata store methods
		const metadataStore = (synchronizer as any).metadataStore;
		jest.spyOn(metadataStore, 'getMsftTaskId').mockReturnValue(undefined);
		jest.spyOn(metadataStore, 'findByMsftTaskId').mockReturnValue(undefined);
		jest.spyOn(metadataStore, 'setMetadata').mockImplementation(() => {});
	});

	test('should create synchronizer instance', () => {
		expect(synchronizer).toBeDefined();
	});

	test('should detect duplicates by title', () => {
		const obsidianTasks: any[] = [
			{ title: 'Task 1', startDate: '2024-01-01' },
			{ title: 'Task 2', startDate: '2024-01-02' },
		];

		const msftTasks: any[] = [
			{ id: 'msft-1', title: 'Task 1' },
			{ id: 'msft-2', title: 'Task 2' },
			{ id: 'msft-3', title: 'Task 3' },
		];

		const duplicates = synchronizer.detectDuplicates(obsidianTasks, msftTasks);

		// Since we don't have metadata, all matching titles are considered duplicates
		expect(duplicates).toHaveLength(2);
		expect(duplicates[0]).toEqual({
			obsidianTask: obsidianTasks[0],
			msftTask: msftTasks[0],
			confidence: 1.0,
		});
		expect(duplicates[1]).toEqual({
			obsidianTask: obsidianTasks[1],
			msftTask: msftTasks[1],
			confidence: 1.0,
		});
	});

	test('should handle empty task lists', () => {
		const duplicates = synchronizer.detectDuplicates([], []);
		expect(duplicates).toHaveLength(0);
	});

	test('should ignore case differences in titles', () => {
		const obsidianTasks: any[] = [
			{ title: 'TASK ONE', startDate: '2024-01-01' },
		];

		const msftTasks: any[] = [
			{ id: 'msft-1', title: 'task one' },
		];

		const duplicates = synchronizer.detectDuplicates(obsidianTasks, msftTasks);

		expect(duplicates).toHaveLength(1);
	});
});