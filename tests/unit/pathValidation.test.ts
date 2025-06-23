// Tests for PathValidator

import { PathValidator } from '../../src/utils/pathValidation';

// Mock TFolder and TFile classes
class MockTFolder {
	path: string;
	name: string;
	children: any[];
	
	constructor(path: string, name: string = '') {
		this.path = path;
		this.name = name || path.split('/').pop() || '';
		this.children = [];
	}
}

class MockTFile {
	path: string;
	name: string;
	
	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
	}
}

// Mock Obsidian API
const mockApp = {
	vault: {
		getAbstractFileByPath: jest.fn(),
		createFolder: jest.fn(),
		getMarkdownFiles: jest.fn(),
		getAllLoadedFiles: jest.fn(),
	}
} as any;

describe('PathValidator', () => {
	let pathValidator: PathValidator;

	beforeEach(() => {
		pathValidator = new PathValidator(mockApp);
		jest.clearAllMocks();
	});

	describe('validateFolderPath', () => {
		it('should return invalid for empty path', () => {
			const result = pathValidator.validateFolderPath('');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('パスを入力してください');
		});

		it('should return invalid for whitespace-only path', () => {
			const result = pathValidator.validateFolderPath('   ');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('パスを入力してください');
		});

		it('should return invalid when folder does not exist', () => {
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
			
			const result = pathValidator.validateFolderPath('nonexistent');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('フォルダが見つかりません: nonexistent');
		});

		it('should return invalid when path points to a file instead of folder', () => {
			const mockFile = new MockTFile('test.md');
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			
			const result = pathValidator.validateFolderPath('test.md');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('指定されたパスはフォルダではありません: test.md');
		});

		it('should return valid when folder exists', () => {
			const mockFolder = new MockTFolder('Daily Notes');
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
			
			const result = pathValidator.validateFolderPath('Daily Notes');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should normalize path by removing leading/trailing slashes', () => {
			const mockFolder = new MockTFolder('Daily Notes');
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
			
			pathValidator.validateFolderPath('/Daily Notes/');
			expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith('Daily Notes');
		});
	});

	describe('validateFilePath', () => {
		it('should return valid for empty path (no template)', () => {
			const result = pathValidator.validateFilePath('');
			expect(result.isValid).toBe(true);
		});

		it('should return valid for whitespace-only path', () => {
			const result = pathValidator.validateFilePath('   ');
			expect(result.isValid).toBe(true);
		});

		it('should return invalid when file does not exist', () => {
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
			
			const result = pathValidator.validateFilePath('nonexistent.md');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('ファイルが見つかりません: nonexistent.md');
		});

		it('should return invalid when path points to a folder instead of file', () => {
			const mockFolder = new MockTFolder('Templates');
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
			
			const result = pathValidator.validateFilePath('Templates');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('指定されたパスはファイルではありません: Templates');
		});

		it('should return valid when markdown file exists', () => {
			const mockFile = new MockTFile('template.md');
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			
			const result = pathValidator.validateFilePath('template.md');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return warning for non-markdown file', () => {
			const mockFile = new MockTFile('template.txt');
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			
			const result = pathValidator.validateFilePath('template.txt');
			expect(result.isValid).toBe(true);
			expect(result.warningMessage).toBe('テンプレートファイルは.mdファイルを推奨します');
		});
	});

	describe('createFolderIfNeeded', () => {
		it('should return valid if folder already exists', async () => {
			const mockFolder = new MockTFolder('Daily Notes');
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);
			
			const result = await pathValidator.createFolderIfNeeded('Daily Notes');
			expect(result.isValid).toBe(true);
			expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
		});

		it('should create folder and return success message', async () => {
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
			mockApp.vault.createFolder.mockResolvedValue(undefined);
			
			const result = await pathValidator.createFolderIfNeeded('New Folder');
			expect(result.isValid).toBe(true);
			expect(result.warningMessage).toBe('フォルダを作成しました: New Folder');
			expect(mockApp.vault.createFolder).toHaveBeenCalledWith('New Folder');
		});

		it('should return error if folder creation fails', async () => {
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
			mockApp.vault.createFolder.mockRejectedValue(new Error('Permission denied'));
			
			const result = await pathValidator.createFolderIfNeeded('Protected Folder');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('フォルダの作成に失敗しました: Permission denied');
		});
	});

	describe('getAllMarkdownFiles', () => {
		it('should return sorted list of markdown file paths', () => {
			const mockFiles = [
				new MockTFile('notes/note1.md'),
				new MockTFile('templates/daily.md'),
				new MockTFile('archive/old.md'),
			];
			
			mockApp.vault.getMarkdownFiles.mockReturnValue(mockFiles);
			
			const result = pathValidator.getAllMarkdownFiles();
			expect(result).toEqual([
				'archive/old.md',
				'notes/note1.md',
				'templates/daily.md',
			]);
		});
	});

	describe('getAllFolders', () => {
		it('should return sorted list of folder paths', () => {
			const mockFolders = [
				new MockTFolder('Templates'),
				new MockTFolder('Daily Notes'),
				new MockTFolder('Archive'),
			];
			
			mockApp.vault.getAllLoadedFiles.mockReturnValue(mockFolders);
			
			const result = pathValidator.getAllFolders();
			expect(result).toEqual([
				'Archive',
				'Daily Notes',
				'Templates',
			]);
		});
	});
});