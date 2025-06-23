// Tests for DailyNoteManager

import { App, TFile } from 'obsidian';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { DailyNoteTask } from '../../src/types';

describe('DailyNoteManager', () => {
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

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('getTodayNotePath', () => {
		it('should generate correct path for today', () => {
			const today = new Date();
			const expectedDate = today.toISOString().slice(0, 10);
			const path = manager.getTodayNotePath();
			
			expect(path).toBe(`Daily Notes/${expectedDate}.md`);
		});

		it('should use custom daily notes path', () => {
			const customManager = new DailyNoteManager(mockApp, mockLogger, 'Journal');
			const today = new Date();
			const expectedDate = today.toISOString().slice(0, 10);
			const path = customManager.getTodayNotePath();
			
			expect(path).toBe(`Journal/${expectedDate}.md`);
		});
	});

	describe('ensureTodayNoteExists', () => {
		it('should return existing file path if note exists', async () => {
			const todayPath = manager.getTodayNotePath();
			const mockFile = new TFile();
			mockFile.path = todayPath;

			mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFile);

			const result = await manager.ensureTodayNoteExists();

			expect(result).toBe(todayPath);
			expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith(todayPath);
		});

		it('should create new daily note if it does not exist', async () => {
			const todayPath = manager.getTodayNotePath();
			const mockFile = new TFile();
			mockFile.path = todayPath;

			mockApp.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);
			mockApp.vault.create = jest.fn().mockResolvedValue(mockFile);

			const result = await manager.ensureTodayNoteExists();

			expect(result).toBe(todayPath);
			expect(mockApp.vault.create).toHaveBeenCalledWith(
				todayPath,
				expect.stringContaining('# Daily Note')
			);
		});
	});

	describe('findOrCreateTodoSection', () => {
		it('should find existing todo section', async () => {
			const fileContent = `# Daily Note

## ToDo
- [ ] Task 1
- [x] Task 2

## Notes
Some notes here.`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			const sectionLine = await manager.findOrCreateTodoSection('test.md');

			expect(sectionLine).toBe(2); // 0-indexed, "## ToDo" is on line 2
		});

		it('should create todo section if it does not exist', async () => {
			const fileContent = `# Daily Note

## Notes
Some notes here.`;

			const expectedContent = `# Daily Note

## ToDo

## Notes
Some notes here.`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			const sectionLine = await manager.findOrCreateTodoSection('test.md');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
			expect(sectionLine).toBe(2); // Line where section was inserted
		});
	});

	describe('addTaskToTodoSection', () => {
		it('should add new task to todo section', async () => {
			const fileContent = `# Daily Note

## ToDo
- [ ] Existing task

## Notes`;

			const expectedContent = `# Daily Note

## ToDo
- [ ] Existing task
- [ ] New task [todo::task-123]

## Notes`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			await manager.addTaskToTodoSection('test.md', 'New task', 'task-123');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});

		it('should add task without todo ID if not provided', async () => {
			const fileContent = `# Daily Note

## ToDo

## Notes`;

			const expectedContent = `# Daily Note

## ToDo
- [ ] Simple task

## Notes`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			await manager.addTaskToTodoSection('test.md', 'Simple task');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});
	});

	describe('getDailyNoteTasks', () => {
		it('should parse tasks from daily note', async () => {
			const fileContent = `# Daily Note

## ToDo
- [ ] Task 1 [todo::task-123]
- [x] Task 2 [todo::task-456] ✅ 2024-01-15
- [ ] Task 3

## Notes`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			const tasks = await manager.getDailyNoteTasks('test.md');

			expect(tasks).toHaveLength(3);
			
			expect(tasks[0]).toEqual({
				title: 'Task 1',
				completed: false,
				lineNumber: 3,
				todoId: 'task-123',
				completionDate: undefined,
				startDate: undefined,
				filePath: 'test.md',
			});

			expect(tasks[1]).toEqual({
				title: 'Task 2',
				completed: true,
				lineNumber: 4,
				todoId: 'task-456',
				completionDate: '2024-01-15',
				startDate: undefined,
				filePath: 'test.md',
			});

			expect(tasks[2]).toEqual({
				title: 'Task 3',
				completed: false,
				lineNumber: 5,
				todoId: undefined,
				completionDate: undefined,
				startDate: undefined,
				filePath: 'test.md',
			});
		});

		it('should return empty array if no tasks found', async () => {
			const fileContent = `# Daily Note

## Notes
No tasks here.`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			const tasks = await manager.getDailyNoteTasks('test.md');

			expect(tasks).toHaveLength(0);
		});
	});

	describe('updateTaskCompletion', () => {
		it('should mark task as completed with date', async () => {
			const fileContent = `# Daily Note

## ToDo
- [ ] Task 1 [todo::task-123]
- [ ] Task 2`;

			const expectedContent = `# Daily Note

## ToDo
- [x] Task 1 [todo::task-123] ✅ 2024-01-15
- [ ] Task 2`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			await manager.updateTaskCompletion('test.md', 3, true, '2024-01-15');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});

		it('should mark task as incomplete', async () => {
			const fileContent = `# Daily Note

## ToDo
- [x] Task 1 [todo::task-123] ✅ 2024-01-15
- [ ] Task 2`;

			const expectedContent = `# Daily Note

## ToDo
- [ ] Task 1 [todo::task-123]
- [ ] Task 2`;

			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);
			mockApp.vault.modify = jest.fn().mockResolvedValue(undefined);

			await manager.updateTaskCompletion('test.md', 3, false);

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(Object),
				expectedContent
			);
		});
	});
});