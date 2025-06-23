// Path validation utilities for settings

import { App, TFolder, TFile } from 'obsidian';

export interface ValidationResult {
	isValid: boolean;
	error?: string;
	warningMessage?: string;
}

export class PathValidator {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Validate that a folder path exists
	 */
	validateFolderPath(path: string): ValidationResult {
		if (!path || path.trim() === '') {
			return {
				isValid: false,
				error: 'パスを入力してください'
			};
		}

		const normalizedPath = this.normalizePath(path);
		
		// Check if path exists as a folder
		const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
		
		if (!abstractFile) {
			return {
				isValid: false,
				error: `フォルダが見つかりません: ${normalizedPath}`
			};
		}

		if (!this.isTFolder(abstractFile)) {
			return {
				isValid: false,
				error: `指定されたパスはフォルダではありません: ${normalizedPath}`
			};
		}

		return { isValid: true };
	}

	/**
	 * Validate that a file path exists
	 */
	validateFilePath(path: string): ValidationResult {
		if (!path || path.trim() === '') {
			// Empty template path is valid (means no template)
			return { isValid: true };
		}

		const normalizedPath = this.normalizePath(path);
		
		// Check if path exists as a file
		const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
		
		if (!abstractFile) {
			return {
				isValid: false,
				error: `ファイルが見つかりません: ${normalizedPath}`
			};
		}

		if (!this.isTFile(abstractFile)) {
			return {
				isValid: false,
				error: `指定されたパスはファイルではありません: ${normalizedPath}`
			};
		}

		// Check if it's a markdown file
		if (!normalizedPath.endsWith('.md')) {
			return {
				isValid: true,
				warningMessage: 'テンプレートファイルは.mdファイルを推奨します'
			};
		}

		return { isValid: true };
	}

	/**
	 * Suggest creating a folder if it doesn't exist
	 */
	async createFolderIfNeeded(path: string): Promise<ValidationResult> {
		const normalizedPath = this.normalizePath(path);
		
		try {
			// Check if folder already exists
			const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (existingFile && this.isTFolder(existingFile)) {
				return { isValid: true };
			}

			// Create the folder
			await this.app.vault.createFolder(normalizedPath);
			return { 
				isValid: true,
				warningMessage: `フォルダを作成しました: ${normalizedPath}`
			};
		} catch (error) {
			return {
				isValid: false,
				error: `フォルダの作成に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 * Normalize path by removing leading/trailing slashes and handling empty paths
	 * Also validates against path traversal attacks
	 */
	private normalizePath(path: string): string {
		if (!path) return '';
		
		// Remove leading and trailing slashes/spaces
		let normalized = path.trim().replace(/^\/+|\/+$/g, '');
		
		// Handle root case
		if (normalized === '') return '';
		
		// Security check: prevent path traversal attacks
		if (normalized.includes('..') || normalized.includes('\\')) {
			throw new Error('Invalid path: Path traversal attempt detected');
		}
		
		// Additional security: ensure path doesn't contain dangerous characters
		if (/[<>:"|?*]/.test(normalized)) {
			throw new Error('Invalid path: Contains forbidden characters');
		}
		
		return normalized;
	}

	/**
	 * Get all available folders in the vault (for suggestions)
	 */
	getAllFolders(): string[] {
		const folders: string[] = [];
		
		const collectFolders = (folder: TFolder, currentPath: string = '') => {
			const folderPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
			if (folderPath !== folder.name || folder.name !== '') {
				folders.push(folderPath);
			}
			
			folder.children.forEach(child => {
				if (child instanceof TFolder) {
					collectFolders(child, folderPath);
				}
			});
		};

		// Start from root
		this.app.vault.getAllLoadedFiles()
			.filter(file => this.isTFolder(file))
			.forEach(folder => {
				if (folder.path) {
					folders.push(folder.path);
				}
			});

		return folders.sort();
	}

	/**
	 * Get all markdown files in the vault (for template suggestions)
	 */
	getAllMarkdownFiles(): string[] {
		return this.app.vault.getMarkdownFiles()
			.map(file => file.path)
			.sort();
	}

	/**
	 * Type guard to check if an object is a TFolder
	 */
	private isTFolder(file: any): file is TFolder {
		return file && typeof file === 'object' && 'children' in file && Array.isArray(file.children);
	}

	/**
	 * Type guard to check if an object is a TFile
	 */
	private isTFile(file: any): file is TFile {
		return file && typeof file === 'object' && 'path' in file && !('children' in file);
	}
}