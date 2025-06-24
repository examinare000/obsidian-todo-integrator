// Tests for TaskMetadataStore

import { Plugin } from 'obsidian';
import { TaskMetadataStore } from '../../src/sync/TaskMetadataStore';
import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('TaskMetadataStore', () => {
	let store: TaskMetadataStore;
	let mockPlugin: Plugin;
	let mockLogger: SimpleLogger;
	let mockLoadData: jest.Mock;
	let mockSaveData: jest.Mock;

	beforeEach(() => {
		// Mock plugin with loadData/saveData methods
		mockLoadData = jest.fn().mockResolvedValue({});
		mockSaveData = jest.fn().mockResolvedValue(undefined);
		
		mockPlugin = {
			loadData: mockLoadData,
			saveData: mockSaveData
		} as any;

		// Mock logger
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			setLogLevel: jest.fn()
		} as any;

		store = new TaskMetadataStore(mockPlugin, mockLogger);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should initialize with plugin and logger', () => {
			expect(mockLogger.debug).toHaveBeenCalledWith(
				'TaskMetadataStore constructor',
				expect.objectContaining({
					hasPlugin: true,
					hasLoadData: true,
					hasSaveData: true,
					pluginType: 'Object'
				})
			);
		});

		it('should load metadata on initialization', () => {
			// The constructor should trigger loadData
			expect(mockLoadData).toHaveBeenCalled();
		});
	});

	describe('setMetadata', () => {
		it('should store metadata for a task', async () => {
			const date = '2024-01-15';
			const title = 'Test Task';
			const msftTaskId = 'msft-123';

			await store.setMetadata(date, title, msftTaskId);

			expect(mockSaveData).toHaveBeenCalledWith({
				'todo-integrator-task-metadata': [
					[`${date}::${title}`, {
						msftTaskId,
						date,
						title,
						lastSynced: expect.any(Number)
					}]
				]
			});

			expect(mockLogger.debug).toHaveBeenCalledWith(
				'Task metadata stored',
				{ key: `${date}::${title}`, msftTaskId }
			);
		});
	});

	describe('getMsftTaskId', () => {
		it('should return Microsoft task ID for existing task', async () => {
			const date = '2024-01-15';
			const title = 'Test Task';
			const msftTaskId = 'msft-123';

			await store.setMetadata(date, title, msftTaskId);

			const result = store.getMsftTaskId(date, title);
			expect(result).toBe(msftTaskId);
		});

		it('should return undefined for non-existent task', () => {
			const result = store.getMsftTaskId('2024-01-15', 'Non-existent Task');
			expect(result).toBeUndefined();
		});
	});

	describe('getMetadataByDate', () => {
		it('should return all metadata for a specific date', async () => {
			const date = '2024-01-15';
			await store.setMetadata(date, 'Task 1', 'msft-1');
			await store.setMetadata(date, 'Task 2', 'msft-2');
			await store.setMetadata('2024-01-16', 'Task 3', 'msft-3');

			const result = store.getMetadataByDate(date);
			expect(result).toHaveLength(2);
			expect(result[0].title).toBe('Task 1');
			expect(result[1].title).toBe('Task 2');
		});

		it('should return empty array for date with no tasks', () => {
			const result = store.getMetadataByDate('2024-01-20');
			expect(result).toEqual([]);
		});
	});

	describe('findByMsftTaskId', () => {
		it('should find task by Microsoft task ID', async () => {
			const date = '2024-01-15';
			const title = 'Test Task';
			const msftTaskId = 'msft-123';

			await store.setMetadata(date, title, msftTaskId);

			const result = store.findByMsftTaskId(msftTaskId);
			expect(result).toEqual({
				msftTaskId,
				date,
				title,
				lastSynced: expect.any(Number)
			});
		});

		it('should return undefined for non-existent task ID', () => {
			const result = store.findByMsftTaskId('non-existent');
			expect(result).toBeUndefined();
		});
	});

	describe('updateTitle', () => {
		it('should update task title and maintain metadata', async () => {
			const date = '2024-01-15';
			const oldTitle = 'Old Task Title';
			const newTitle = 'New Task Title';
			const msftTaskId = 'msft-123';

			await store.setMetadata(date, oldTitle, msftTaskId);
			await store.updateTitle(date, oldTitle, newTitle);

			// Old title should not exist
			expect(store.getMsftTaskId(date, oldTitle)).toBeUndefined();

			// New title should exist with same ID
			expect(store.getMsftTaskId(date, newTitle)).toBe(msftTaskId);

			expect(mockLogger.debug).toHaveBeenCalledWith(
				'Task title updated in metadata',
				{ oldTitle, newTitle, date }
			);
		});

		it('should do nothing if task does not exist', async () => {
			await store.updateTitle('2024-01-15', 'Non-existent', 'New Title');
			
			// Save should not have been called for non-existent task
			expect(mockSaveData).toHaveBeenCalledTimes(0);
		});
	});

	describe('removeMetadata', () => {
		it('should remove metadata for a task', async () => {
			const date = '2024-01-15';
			const title = 'Test Task';
			const msftTaskId = 'msft-123';

			await store.setMetadata(date, title, msftTaskId);
			await store.removeMetadata(date, title);

			expect(store.getMsftTaskId(date, title)).toBeUndefined();
			expect(mockLogger.debug).toHaveBeenCalledWith(
				'Task metadata removed',
				{ key: `${date}::${title}` }
			);
		});

		it('should do nothing if task does not exist', async () => {
			const initialSaveCount = mockSaveData.mock.calls.length;
			await store.removeMetadata('2024-01-15', 'Non-existent Task');
			
			// Save should not have been called
			expect(mockSaveData).toHaveBeenCalledTimes(initialSaveCount);
		});
	});

	describe('cleanupOldMetadata', () => {
		it('should remove metadata older than 90 days', async () => {
			const now = Date.now();
			const oldDate = new Date(now - 91 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
			const recentDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

			await store.setMetadata(oldDate, 'Old Task', 'msft-old');
			await store.setMetadata(recentDate, 'Recent Task', 'msft-recent');

			// Manually set the lastSynced time for old task
			const metadata = (store as any).metadata;
			const oldKey = `${oldDate}::Old Task`;
			const oldMetadata = metadata.get(oldKey);
			if (oldMetadata) {
				oldMetadata.lastSynced = now - 91 * 24 * 60 * 60 * 1000;
			}

			await store.cleanupOldMetadata();

			expect(store.getMsftTaskId(oldDate, 'Old Task')).toBeUndefined();
			expect(store.getMsftTaskId(recentDate, 'Recent Task')).toBe('msft-recent');
			
			expect(mockLogger.info).toHaveBeenCalledWith(
				'Cleaned up old metadata',
				{ removed: 1 }
			);
		});

		it('should not save if no old metadata exists', async () => {
			const recentDate = new Date().toISOString().slice(0, 10);
			await store.setMetadata(recentDate, 'Recent Task', 'msft-recent');

			const saveCountBefore = mockSaveData.mock.calls.length;
			await store.cleanupOldMetadata();
			const saveCountAfter = mockSaveData.mock.calls.length;

			expect(saveCountAfter).toBe(saveCountBefore);
		});
	});

	describe('clearAll', () => {
		it('should clear all metadata', async () => {
			await store.setMetadata('2024-01-15', 'Task 1', 'msft-1');
			await store.setMetadata('2024-01-16', 'Task 2', 'msft-2');

			await store.clearAll();

			expect(store.getMsftTaskId('2024-01-15', 'Task 1')).toBeUndefined();
			expect(store.getMsftTaskId('2024-01-16', 'Task 2')).toBeUndefined();
			
			expect(mockLogger.info).toHaveBeenCalledWith('All task metadata cleared');
		});
	});

	describe('persistence', () => {
		it('should load existing metadata from storage', async () => {
			const existingData = {
				'todo-integrator-task-metadata': [
					['2024-01-15::Existing Task', {
						msftTaskId: 'msft-existing',
						date: '2024-01-15',
						title: 'Existing Task',
						lastSynced: Date.now()
					}]
				]
			};

			mockLoadData.mockResolvedValue(existingData);

			// Create new store to trigger load
			const newStore = new TaskMetadataStore(mockPlugin, mockLogger);
			
			// Manually call loadMetadata and wait for it to complete
			await (newStore as any).loadMetadata();
			
			expect(newStore.getMsftTaskId('2024-01-15', 'Existing Task')).toBe('msft-existing');
			expect(mockLogger.debug).toHaveBeenCalledWith(
				'Loaded task metadata',
				{ count: 1 }
			);
		});

		it('should handle load errors gracefully', async () => {
			mockLoadData.mockRejectedValue(new Error('Load failed'));

			// Create new store to trigger load
			const newStore = new TaskMetadataStore(mockPlugin, mockLogger);
			
			// Manually call loadMetadata and wait for it to complete
			await (newStore as any).loadMetadata();
			
			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to load task metadata',
				expect.any(Error)
			);

			// Store should still be functional
			await newStore.setMetadata('2024-01-15', 'New Task', 'msft-new');
			expect(newStore.getMsftTaskId('2024-01-15', 'New Task')).toBe('msft-new');
		});

		it('should handle save errors gracefully', async () => {
			mockSaveData.mockRejectedValue(new Error('Save failed'));

			await store.setMetadata('2024-01-15', 'Test Task', 'msft-123');

			expect(mockLogger.error).toHaveBeenCalledWith(
				'Failed to save task metadata',
				expect.any(Error)
			);
		});
	});
});