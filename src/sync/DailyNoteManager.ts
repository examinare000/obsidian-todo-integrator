// Daily Note Manager for ToDo Integrator
// Manages Daily Notes creation, Todo section handling, and task parsing

import { App, TFile, TAbstractFile } from 'obsidian';
import { DailyNoteTask, Logger, ErrorContext } from '../types';
import { 
	DATE_FORMAT, 
	TODO_SECTION_HEADER, 
	TASK_REGEX, 
	TODO_ID_REGEX, 
	COMPLETION_DATE_REGEX,
	ERROR_CODES 
} from '../constants';

export class DailyNoteManager {
	private app: App;
	private logger: Logger;
	private dailyNotesPath: string;

	constructor(app: App, logger: Logger, dailyNotesPath: string = 'Daily Notes') {
		this.app = app;
		this.logger = logger;
		this.dailyNotesPath = dailyNotesPath;
	}

	getTodayNotePath(): string {
		const today = new Date();
		const dateString = today.toISOString().slice(0, 10); // YYYY-MM-DD format
		return `${this.dailyNotesPath}/${dateString}.md`;
	}

	async ensureTodayNoteExists(): Promise<string> {
		const todayPath = this.getTodayNotePath();
		
		try {
			// Check if file already exists
			const existingFile = this.app.vault.getAbstractFileByPath(todayPath);
			if (existingFile && existingFile instanceof TFile) {
				this.logger.debug('Daily note already exists', { path: todayPath });
				return todayPath;
			}

			// Create new daily note
			this.logger.info('Creating new daily note', { path: todayPath });
			const defaultContent = this.generateDefaultDailyNoteContent();
			
			await this.app.vault.create(todayPath, defaultContent);
			this.logger.info('Daily note created successfully', { path: todayPath });
			
			return todayPath;

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'ensureTodayNoteExists',
				timestamp: new Date().toISOString(),
				details: { todayPath, error },
			};
			this.logger.error('Failed to ensure daily note exists', context);
			throw new Error(`${ERROR_CODES.FILE_NOT_FOUND}: Failed to create daily note`);
		}
	}

	async findOrCreateTodoSection(filePath: string): Promise<number> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			// Look for existing Todo section
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === TODO_SECTION_HEADER) {
					this.logger.debug('Found existing Todo section', { filePath, lineNumber: i });
					return i;
				}
			}

			// Todo section not found, create it
			this.logger.info('Creating Todo section', { filePath });
			const insertionPoint = this.findTodoSectionInsertionPoint(lines);
			
			// Insert Todo section
			lines.splice(insertionPoint, 0, TODO_SECTION_HEADER, '');
			const newContent = lines.join('\n');
			
			await this.app.vault.modify(file, newContent);
			this.logger.debug('Todo section created', { filePath, lineNumber: insertionPoint });
			
			return insertionPoint;

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'findOrCreateTodoSection',
				timestamp: new Date().toISOString(),
				details: { filePath, error },
			};
			this.logger.error('Failed to find or create Todo section', context);
			throw error;
		}
	}

	async addTaskToTodoSection(filePath: string, taskTitle: string, todoId?: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			// Find Todo section
			const todoSectionLine = await this.findOrCreateTodoSection(filePath);
			
			// Find insertion point within Todo section
			let insertionLine = todoSectionLine + 1;
			
			// Skip to after existing tasks
			for (let i = todoSectionLine + 1; i < lines.length; i++) {
				const line = lines[i].trim();
				
				// Stop if we hit another section header
				if (line.startsWith('##') && line !== TODO_SECTION_HEADER) {
					break;
				}
				
				// Skip if this is a task line
				if (line.match(/^- \[[x ]\]/)) {
					insertionLine = i + 1;
					continue;
				}
				
				// Stop if we hit a non-task, non-empty line
				if (line && !line.match(/^- \[[x ]\]/)) {
					break;
				}
			}

			// Format the task line
			const todoIdPart = todoId ? ` [todo::${todoId}]` : '';
			const taskLine = `- [ ] ${taskTitle}${todoIdPart}`;

			// Insert the task
			lines.splice(insertionLine, 0, taskLine);
			const newContent = lines.join('\n');

			await this.app.vault.modify(file, newContent);
			this.logger.info('Task added to Todo section', { 
				filePath, 
				taskTitle, 
				todoId, 
				lineNumber: insertionLine 
			});

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'addTaskToTodoSection',
				timestamp: new Date().toISOString(),
				details: { filePath, taskTitle, todoId, error },
			};
			this.logger.error('Failed to add task to Todo section', context);
			throw error;
		}
	}

	async getDailyNoteTasks(filePath: string): Promise<DailyNoteTask[]> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				this.logger.debug('Daily note file not found', { filePath });
				return [];
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const tasks: DailyNoteTask[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const taskMatch = line.match(TASK_REGEX);

				if (taskMatch) {
					const [, completed, title, todoId, completionDate] = taskMatch;
					
					const task: DailyNoteTask = {
						title: title.trim(),
						completed: completed === 'x',
						lineNumber: i,
						todoId: todoId || undefined,
						completionDate: completionDate || undefined,
					};

					tasks.push(task);
				}
			}

			this.logger.debug('Parsed daily note tasks', { 
				filePath, 
				taskCount: tasks.length 
			});

			return tasks;

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'getDailyNoteTasks',
				timestamp: new Date().toISOString(),
				details: { filePath, error },
			};
			this.logger.error('Failed to get daily note tasks', context);
			throw error;
		}
	}

	async updateTaskCompletion(
		filePath: string, 
		lineNumber: number, 
		completed: boolean, 
		completionDate?: string
	): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			if (lineNumber >= lines.length) {
				throw new Error(`Line number ${lineNumber} is out of bounds`);
			}

			const currentLine = lines[lineNumber];
			let updatedLine = currentLine;

			if (completed) {
				// Mark as completed
				updatedLine = updatedLine.replace(/^(\s*)- \[ \]/, '$1- [x]');
				
				// Add completion date if provided
				if (completionDate) {
					// Remove existing completion date if present
					updatedLine = updatedLine.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, '');
					// Add new completion date
					updatedLine += ` ✅ ${completionDate}`;
				}
			} else {
				// Mark as incomplete
				updatedLine = updatedLine.replace(/^(\s*)- \[x\]/, '$1- [ ]');
				// Remove completion date
				updatedLine = updatedLine.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, '');
			}

			lines[lineNumber] = updatedLine;
			const newContent = lines.join('\n');

			await this.app.vault.modify(file, newContent);
			this.logger.info('Task completion updated', { 
				filePath, 
				lineNumber, 
				completed,
				completionDate 
			});

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'updateTaskCompletion',
				timestamp: new Date().toISOString(),
				details: { filePath, lineNumber, completed, completionDate, error },
			};
			this.logger.error('Failed to update task completion', context);
			throw error;
		}
	}

	private generateDefaultDailyNoteContent(): string {
		const today = new Date();
		const dateString = today.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});

		return `# Daily Note - ${dateString}

## ToDo

## Notes

## Reflections

`;
	}

	private findTodoSectionInsertionPoint(lines: string[]): number {
		// Look for a good place to insert the Todo section
		// Prefer to insert after the main heading but before other content
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			
			// Skip the main heading
			if (line.startsWith('# ')) {
				continue;
			}
			
			// If we find another section header, insert before it
			if (line.startsWith('## ')) {
				return i;
			}
		}
		
		// If no section headers found, insert after any initial content
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].trim() === '') {
				return i + 1;
			}
		}
		
		// Default: insert at the end
		return lines.length;
	}

	setDailyNotesPath(path: string): void {
		this.dailyNotesPath = path;
		this.logger.debug('Daily notes path updated', { path });
	}

	getDailyNotesPath(): string {
		return this.dailyNotesPath;
	}
}