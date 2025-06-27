import { ObsidianTodoParser } from '../../src/parser/ObsidianTodoParser';
import { App, TFile } from 'obsidian';
import { SimpleLogger } from '../../src/utils/simpleLogger';
import { ErrorHandler } from '../../src/utils/ErrorHandler';

describe('ObsidianTodoParser', () => {
	let mockApp: any;
	let logger: SimpleLogger;
	let errorHandler: ErrorHandler;
	let parser: ObsidianTodoParser;

	beforeEach(() => {
		// Create mock app
		mockApp = {
			vault: {
				getAbstractFileByPath: jest.fn(),
				read: jest.fn(),
				modify: jest.fn()
			}
		};

		// Create logger and error handler
		logger = new SimpleLogger('info');
		jest.spyOn(logger, 'info').mockImplementation();
		jest.spyOn(logger, 'debug').mockImplementation();
		jest.spyOn(logger, 'error').mockImplementation();

		errorHandler = new ErrorHandler(logger);
		jest.spyOn(errorHandler, 'handleFileError').mockImplementation((error) => {
			if (error?.message) {
				return `File error: ${error.message}`;
			}
			return 'File error';
		});

		parser = new ObsidianTodoParser(mockApp as App, logger, errorHandler);
	});

	describe('parseFileTodos', () => {
		it('ファイル内のタスクを正しくパース', async () => {
			// Arrange
			const filePath = 'daily/2024-01-01.md';
			const fileContent = `# Daily Note

## Tasks
- [ ] Buy milk
- [x] Call mom
- [ ] Read book

## Notes
Some other content`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			const tasks = await parser.parseFileTodos(filePath, '## Tasks');

			// Assert
			expect(tasks).toHaveLength(3);
			expect(tasks[0]).toMatchObject({
				file: filePath,
				line: 3,
				text: 'Buy milk',
				completed: false
			});
			expect(tasks[1]).toMatchObject({
				line: 4,
				text: 'Call mom',
				completed: true
			});
		});

		it('セクション指定なしで全ファイルをパース', async () => {
			// Arrange
			const fileContent = `- [ ] Task in root
## Section 1
- [ ] Task in section 1
## Section 2
- [ ] Task in section 2`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			const tasks = await parser.parseFileTodos('test.md');

			// Assert
			expect(tasks).toHaveLength(3);
		});

		it('DataView形式の完了日を正しく抽出', async () => {
			// Arrange
			const fileContent = `- [x] Completed task [completion:: 2024-01-01]
- [ ] Pending task`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			const tasks = await parser.parseFileTodos('test.md');

			// Assert
			expect(tasks[0].completionDate).toBe('2024-01-01');
			expect(tasks[1].completionDate).toBeUndefined();
		});

		it('期限日を正しく抽出', async () => {
			// Arrange
			const fileContent = `- [ ] Task with due date due: 2024-01-15`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			const tasks = await parser.parseFileTodos('test.md');

			// Assert
			expect(tasks[0].dueDate).toBe('2024-01-15');
		});

		it('空のタスクはスキップ', async () => {
			// Arrange
			const fileContent = `- [ ] Valid task
- [ ] 
- [ ]   
- [ ] Another valid task`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			const tasks = await parser.parseFileTodos('test.md');

			// Assert
			expect(tasks).toHaveLength(2);
			expect(tasks[0].text).toBe('Valid task');
			expect(tasks[1].text).toBe('Another valid task');
		});

		it('ファイルが存在しない場合はエラー', async () => {
			// Arrange
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

			// Act & Assert
			await expect(parser.parseFileTodos('nonexistent.md'))
				.rejects.toThrow('Failed to parse file todos: File error');
		});
	});

	describe('updateCheckboxStatus', () => {
		it('チェックボックスの状態を更新', async () => {
			// Arrange
			const filePath = 'test.md';
			const fileContent = `- [ ] Task 1
- [ ] Task 2`;
			const expectedContent = `- [x] Task 1 [completion:: 2024-01-01]
- [ ] Task 2`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			await parser.updateCheckboxStatus(filePath, 0, true, '2024-01-01');

			// Assert
			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
		});

		it('既存の完了日を置き換え', async () => {
			// Arrange
			const fileContent = `- [x] Task 1 [completion:: 2024-01-01]`;
			const expectedContent = `- [ ] Task 1`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			await parser.updateCheckboxStatus('test.md', 0, false);

			// Assert
			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
		});

		it('行番号が範囲外の場合はエラー', async () => {
			// Arrange
			const fileContent = `- [ ] Task 1`;
			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act & Assert
			await expect(parser.updateCheckboxStatus('test.md', 10, true))
				.rejects.toThrow('Failed to update checkbox status: File error');
		});
	});

	describe('extractTaskTitle', () => {
		it('メタデータを除去してクリーンなタイトルを抽出', () => {
			// Test cases
			const testCases = [
				{
					input: 'Buy milk [completion:: 2024-01-01]',
					expected: 'Buy milk'
				},
				{
					input: 'Task with due date due: 2024-01-15',
					expected: 'Task with due date'
				},
				{
					input: 'Task with #tag and [[wiki link]]',
					expected: 'Task with  and'
				},
				{
					input: '**Bold** and *italic* text',
					expected: 'Bold and italic text'
				},
				{
					input: 'Task with everything [completion:: 2024-01-01] due: 2024-01-15 #tag',
					expected: 'Task with everything'
				}
			];

			testCases.forEach(({ input, expected }) => {
				expect(parser.extractTaskTitle(input)).toBe(expected);
			});
		});
	});

	describe('addTaskToFile', () => {
		it('既存セクションにタスクを追加', async () => {
			// Arrange
			const fileContent = `# Daily Note

## Tasks
- [ ] Existing task

## Notes`;
			const expectedContent = `# Daily Note

## Tasks
- [ ] New task
- [ ] Existing task

## Notes`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			await parser.addTaskToFile('test.md', 'Tasks', 'New task');

			// Assert
			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
		});

		it('セクションが存在しない場合は新規作成', async () => {
			// Arrange
			const fileContent = `# Daily Note`;
			const expectedContent = `# Daily Note

## Tasks
- [ ] New task
`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			await parser.addTaskToFile('test.md', 'Tasks', 'New task');

			// Assert
			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
		});

		it('Microsoft Todo IDを含めてタスクを追加', async () => {
			// Arrange
			const fileContent = `## Tasks`;
			const expectedContent = `## Tasks
- [ ] New task [todo-id:: 12345]`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			await parser.addTaskToFile('test.md', 'Tasks', 'New task', '12345');

			// Assert
			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
		});
	});

	describe('findSectionBoundaries', () => {
		it('セクションの境界を正しく検出', async () => {
			// Arrange
			const fileContent = `# Title

## Section 1
- [ ] Task in section 1

## Section 2
- [ ] Task in section 2

### Subsection
- [ ] Task in subsection

## Section 3
- [ ] Task in section 3`;

			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime: Date.now() };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			// Act
			const tasks = await parser.parseFileTodos('test.md', '## Section 2');

			// Assert
			// Section 2の内容のみがパースされることを確認
			expect(tasks).toHaveLength(2); // Section 2とそのサブセクションのタスク
			expect(tasks[0].text).toBe('Task in section 2');
			expect(tasks[1].text).toBe('Task in subsection');
		});
	});

	describe('parseTaskFromLine', () => {
		it('単一行からタスクをパース', () => {
			// Arrange
			const line = '  - [x] Completed task [completion:: 2024-01-01]';

			// Act
			const task = parser.parseTaskFromLine(line, 5, 'test.md');

			// Assert
			expect(task).toMatchObject({
				file: 'test.md',
				line: 5,
				text: 'Completed task',
				completed: true,
				completionDate: '2024-01-01',
				indent: '  '
			});
		});

		it('チェックボックスでない行はnullを返す', () => {
			// Arrange
			const line = 'This is not a task';

			// Act
			const task = parser.parseTaskFromLine(line, 0, 'test.md');

			// Assert
			expect(task).toBeNull();
		});
	});

	describe('getFileModificationDate', () => {
		it('ファイルの更新日時を取得', async () => {
			// Arrange
			const mtime = Date.now();
			const mockFile = Object.create(TFile.prototype);
			mockFile.stat = { mtime };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);

			// Act
			const date = await parser.getFileModificationDate('test.md');

			// Assert
			expect(date).toEqual(new Date(mtime));
		});

		it('ファイルが存在しない場合はエラー', async () => {
			// Arrange
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

			// Act & Assert
			await expect(parser.getFileModificationDate('nonexistent.md'))
				.rejects.toThrow('Failed to get file modification date: File error');
		});
	});
});