// Tests for title cleaning functionality

import { TodoApiClient } from '../../src/api/TodoApiClient';
import { TodoSynchronizer } from '../../src/sync/TodoSynchronizer';
import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('Title Cleaning', () => {
	describe('TodoApiClient title cleaning', () => {
		let apiClient: TodoApiClient;
		let mockLogger: SimpleLogger;

		beforeEach(() => {
			mockLogger = new SimpleLogger('info');
			apiClient = new TodoApiClient(mockLogger);
		});

		it('should remove todo ID tags with special characters', () => {
			// Test the regex pattern directly
			const testCases = [
				{
					input: 'テストタスク_mstd-obsidian [todo::AQMkADAwATM3ZmYAZS1kMzFkLWYwZjEtMDACLTAwCgBGAAADKvJqO0p3mU-FTDGh4VbOKAcAmO8F=]',
					expected: 'テストタスク_mstd-obsidian'
				},
				{
					input: 'Task with [todo::simple-id-123] tag',
					expected: 'Task with tag'
				},
				{
					input: 'Multiple [todo::id1] tags [todo::id2] in title',
					expected: 'Multiple tags in title'
				},
				{
					input: 'Task without ID',
					expected: 'Task without ID'
				},
				{
					input: 'Task with empty [todo::] tag',
					expected: 'Task with empty tag'
				},
				{
					input: 'Task with nested [[todo::nested-id]] brackets',
					expected: 'Task with nested [] brackets'
				}
			];

			testCases.forEach(({ input, expected }) => {
				const cleaned = input.replace(/\[todo::[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
				expect(cleaned).toBe(expected);
			});
		});
	});

	describe('TodoSynchronizer title cleaning', () => {
		let synchronizer: TodoSynchronizer;
		let mockLogger: SimpleLogger;

		beforeEach(() => {
			mockLogger = new SimpleLogger('info');
			// Create a minimal synchronizer instance for testing
			// Mock the DailyNoteManager with app property
			const mockDailyNoteManager = { app: { vault: {} } };
			const mockPlugin = {
				loadData: jest.fn().mockResolvedValue({}),
				saveData: jest.fn().mockResolvedValue(undefined)
			};
			synchronizer = new TodoSynchronizer(null as any, mockDailyNoteManager as any, mockLogger, mockPlugin as any, undefined);
		});

		it('should clean task titles with todo IDs', () => {
			// Access private method via any cast
			const cleanTaskTitle = (synchronizer as any).cleanTaskTitle.bind(synchronizer);

			const testCases = [
				{
					input: 'テストタスク_mstd-obsidian [todo::AQMkADAwATM3ZmYAZS1kMzFkLWYwZjEtMDACLTAwCgBGAAADKvJqO0p3mU-FTDGh4VbOKAcAmO8F=]',
					expected: 'テストタスク_mstd-obsidian'
				},
				{
					input: 'Task [todo::id-with-equals=sign] here',
					expected: 'Task here'
				},
				{
					input: '  Task with   [todo::id]   extra spaces  ',
					expected: 'Task with extra spaces'
				},
				{
					input: 'Task with empty [todo::] tag',
					expected: 'Task with empty tag'
				},
				{
					input: 'Task with nested [[todo::nested-id]] brackets',
					expected: 'Task with nested [] brackets'
				}
			];

			testCases.forEach(({ input, expected }) => {
				const result = cleanTaskTitle(input);
				expect(result).toBe(expected);
			});
		});
	});
});