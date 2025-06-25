// Obsidian Todo Parser for ToDo Integrator Plugin
// Parses and manages Obsidian checkbox tasks with DataView format support

import { App, TFile } from 'obsidian';
import { Logger, ObsidianTask } from '../types';
import { ErrorHandler } from '../utils/ErrorHandler';
import { TASK_REGEX } from '../constants';

export class ObsidianTodoParser {
	private app: App;
	private logger: Logger;
	private errorHandler: ErrorHandler;

	constructor(app: App, logger: Logger, errorHandler: ErrorHandler) {
		this.app = app;
		this.logger = logger;
		this.errorHandler = errorHandler;
	}

	async parseFileTodos(filePath: string, taskSectionHeading?: string): Promise<ObsidianTask[]> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const tasks: ObsidianTask[] = [];

			// If taskSectionHeading is provided, find the section boundaries
			let sectionStartIndex = -1;
			let sectionEndIndex = lines.length;

			if (taskSectionHeading) {
				const sectionBoundaries = this.findSectionBoundaries(lines, taskSectionHeading);
				if (!sectionBoundaries) {
					this.logger.debug(`Task section "${taskSectionHeading}" not found in ${filePath}`);
					return [];
				}
				sectionStartIndex = sectionBoundaries.start;
				sectionEndIndex = sectionBoundaries.end;
			}

			// Parse tasks only within the specified section (or entire file if no section specified)
			const startIndex = taskSectionHeading ? sectionStartIndex + 1 : 0;
			const endIndex = taskSectionHeading ? sectionEndIndex : lines.length;

			for (let i = startIndex; i < endIndex; i++) {
				const line = lines[i];
				const checkboxMatch = line.match(/^(\s*)-\s*\[([x\s])\]\s*(.+)/);
				
				if (!checkboxMatch) continue;
				
				// Skip empty or whitespace-only tasks
				const taskText = checkboxMatch[3].trim();
				if (!taskText || taskText.length === 0) {
					this.logger.debug(`Skipping empty task at line ${i + 1} in ${filePath}`);
					continue;
				}

				const [, indent, checked] = checkboxMatch;
				const isCompleted = checked.toLowerCase() === 'x';
				
				// Extract completion date from DataView format
				const completionMatch = taskText.match(/\[completion::\s*(\d{4}-\d{2}-\d{2})\]/);
				const completionDate = completionMatch ? completionMatch[1] : undefined;
				
				// Extract due date
				const dueDateMatch = taskText.match(/due:\s*(\d{4}-\d{2}-\d{2})/);
				const dueDate = dueDateMatch ? dueDateMatch[1] : undefined;
				
				// Microsoft Todo ID is no longer stored in task text
				const microsoftTodoId = undefined;
				
				// Extract clean title
				const title = this.extractTaskTitle(taskText);

				// Skip if title is empty after cleaning
				if (!title || title.trim().length === 0) {
					this.logger.debug(`Skipping task with empty title at line ${i + 1} in ${filePath}`);
					continue;
				}

				const task: ObsidianTask = {
					file: filePath,
					line: i,
					text: title,
					completed: isCompleted,
					completionDate,
					dueDate,
					microsoftTodoId,
					indent
				};

				tasks.push(task);
			}

			const sectionInfo = taskSectionHeading ? ` in section "${taskSectionHeading}"` : '';
			this.logger.debug(`Parsed ${tasks.length} tasks from ${filePath}${sectionInfo}`);
			return tasks;
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to parse file todos: ${errorMessage}`);
		}
	}

	async updateCheckboxStatus(
		filePath: string, 
		lineNumber: number, 
		completed: boolean, 
		completionDate?: string
	): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			if (lineNumber >= lines.length) {
				throw new Error(`Line number ${lineNumber} is out of range`);
			}

			const line = lines[lineNumber];
			const checkboxMatch = line.match(/^(\s*)-\s*\[([x\s])\]\s*(.+)/);
			
			if (!checkboxMatch) {
				throw new Error(`No checkbox found at line ${lineNumber}`);
			}

			const [, indent, , taskText] = checkboxMatch;
			
			// Remove existing completion metadata
			const cleanTaskText = taskText.replace(/\[completion::\s*\d{4}-\d{2}-\d{2}\]/, '').trim();
			
			// Build new line
			const checkMark = completed ? 'x' : ' ';
			let newLine = `${indent}- [${checkMark}] ${cleanTaskText}`;

			// Add completion date if task is completed
			if (completed && completionDate) {
				newLine += ` [completion:: ${completionDate}]`;
			}

			lines[lineNumber] = newLine;

			await this.app.vault.modify(file, lines.join('\n'));
			this.logger.info(`Updated checkbox at ${filePath}:${lineNumber + 1} - completed: ${completed}`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to update checkbox status: ${errorMessage}`);
		}
	}

	async addTaskToFile(
		filePath: string, 
		sectionHeader: string, 
		taskText: string, 
		microsoftTodoId?: string
	): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			// Find todo section
			let sectionIndex = -1;
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].includes(sectionHeader)) {
					sectionIndex = i;
					break;
				}
			}

			if (sectionIndex === -1) {
				// Add section at the end
				lines.push('', `## ${sectionHeader}`, '');
				sectionIndex = lines.length - 2;
			}

			// Build task line with Microsoft Todo ID if provided
			let taskLine = `- [ ] ${taskText}`;
			if (microsoftTodoId) {
				taskLine += ` [todo-id:: ${microsoftTodoId}]`;
			}

			// Insert task after section header
			lines.splice(sectionIndex + 1, 0, taskLine);

			await this.app.vault.modify(file, lines.join('\n'));
			this.logger.info(`Added task to ${filePath} in ${sectionHeader} section`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to add task to file: ${errorMessage}`);
		}
	}

	async getFileModificationDate(filePath: string): Promise<Date> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			return new Date(file.stat.mtime);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to get file modification date: ${errorMessage}`);
		}
	}

	extractTaskTitle(taskLine: string): string {
		// Remove completion metadata
		let title = taskLine.replace(/\[completion::\s*\d{4}-\d{2}-\d{2}\]/, '');
		
		// Remove due date metadata
		title = title.replace(/due:\s*\d{4}-\d{2}-\d{2}/, '');
		
		// Microsoft Todo ID is no longer stored in task text
		
		// Remove other common metadata patterns
		title = title.replace(/#\w+/g, ''); // Remove hashtags
		title = title.replace(/\[\[.*?\]\]/g, ''); // Remove wiki links
		title = title.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold formatting
		title = title.replace(/(?<!\*)\*(.*?)\*(?!\*)/g, '$1'); // Remove italic formatting (not bold)
		
		return title.trim();
	}

	parseTaskFromLine(line: string, lineNumber: number, filePath: string): ObsidianTask | null {
		const checkboxMatch = line.match(TASK_REGEX);
		if (!checkboxMatch) {
			return null;
		}

		const [, indent, checked, taskText] = checkboxMatch;
		const isCompleted = checked.toLowerCase() === 'x';
		
		// Extract metadata
		const completionMatch = taskText.match(/\[completion::\s*(\d{4}-\d{2}-\d{2})\]/);
		const completionDate = completionMatch ? completionMatch[1] : undefined;
		
		const dueDateMatch = taskText.match(/due:\s*(\d{4}-\d{2}-\d{2})/);
		const dueDate = dueDateMatch ? dueDateMatch[1] : undefined;
		
		// Microsoft Todo ID is no longer stored in task text
		const microsoftTodoId = undefined;
		
		const title = this.extractTaskTitle(taskText);

		return {
			file: filePath,
			line: lineNumber,
			text: title,
			completed: isCompleted,
			completionDate,
			dueDate,
			microsoftTodoId,
			indent
		};
	}

	private findSectionBoundaries(lines: string[], taskSectionHeading: string): { start: number; end: number } | null {
		const targetHeading = taskSectionHeading.trim();
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line !== targetHeading) continue;
			
			// Found the section start
			const currentLevel = (taskSectionHeading.match(/^#+/) || [''])[0].length;
			let sectionEndIndex = lines.length;
			
			// Find the end of this section (next heading of same or higher level)
			for (let j = i + 1; j < lines.length; j++) {
				const nextLine = lines[j].trim();
				const nextHeadingMatch = nextLine.match(/^(#+)\s/);
				if (!nextHeadingMatch) continue;
				if (nextHeadingMatch[1].length <= currentLevel) {
					sectionEndIndex = j;
					break;
				}
			}
			
			return { start: i, end: sectionEndIndex };
		}
		
		return null;
	}
}