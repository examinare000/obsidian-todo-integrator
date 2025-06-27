// Daily Note Manager for ToDo Integrator
// Manages Daily Notes creation, Todo section handling, and task parsing

import { App, TFile, TAbstractFile, TFolder, Vault } from 'obsidian';
import { DailyNoteTask, Logger, ErrorContext } from '../types';
import { 
	DATE_FORMAT, 
	TODO_SECTION_HEADER, 
	TASK_REGEX, 
	COMPLETION_DATE_REGEX,
	ERROR_CODES 
} from '../constants';
import { DataViewCompat } from '../utils/DataViewCompat';
// Note: Using native Date formatting to avoid moment dependency issues in tests

export class DailyNoteManager {
	private app: App;
	private logger: Logger;
	private dailyNotesPath: string;
	private dateFormat: string;
	private templatePath?: string;

	constructor(
		app: App, 
		logger: Logger, 
		dailyNotesPath: string = 'Daily Notes',
		dateFormat: string = 'YYYY-MM-DD',
		templatePath?: string
	) {
		this.app = app;
		this.logger = logger;
		this.dailyNotesPath = dailyNotesPath;
		this.dateFormat = dateFormat;
		this.templatePath = templatePath;
	}

	getTodayNotePath(): string {
		const today = new Date();
		const dateString = this.formatDate(today, this.dateFormat);
		// Security check: ensure path doesn't contain traversal attempts
		const safePath = this.sanitizePath(`${this.dailyNotesPath}/${dateString}.md`);
		return safePath;
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
			const defaultContent = await this.generateDailyNoteContent();
			
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

	async createDailyNote(date: string): Promise<void> {
		const notePath = this.getNotePath(date);
		
		try {
			// Check if file already exists
			const existingFile = this.app.vault.getAbstractFileByPath(notePath);
			if (existingFile && existingFile instanceof TFile) {
				this.logger.debug('Daily note already exists', { path: notePath, date });
				return;
			}

			// Create new daily note with specific date
			this.logger.info('Creating new daily note', { path: notePath, date });
			const targetDate = new Date(date);
			const content = await this.generateDailyNoteContentForDate(targetDate);
			
			await this.app.vault.create(notePath, content);
			this.logger.info('Daily note created successfully', { path: notePath, date });
			
		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'createDailyNote',
				timestamp: new Date().toISOString(),
				details: { notePath, date, error },
			};
			this.logger.error('Failed to create daily note', context);
			throw new Error(`${ERROR_CODES.FILE_NOT_FOUND}: Failed to create daily note for ${date}`);
		}
	}

	async findOrCreateTodoSection(filePath: string, sectionHeader?: string): Promise<number> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			// Use provided section header or fallback to default
			const targetHeader = sectionHeader || TODO_SECTION_HEADER;

			// Look for existing Todo section
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === targetHeader.trim()) {
					this.logger.debug('Found existing Todo section', { filePath, lineNumber: i, header: targetHeader });
					return i;
				}
			}

			// Todo section not found, create it
			this.logger.info('Creating Todo section', { filePath, header: targetHeader });
			const insertionPoint = this.findTodoSectionInsertionPoint(lines);
			
			// Insert Todo section
			lines.splice(insertionPoint, 0, targetHeader, '');
			const newContent = lines.join('\n');
			
			await this.app.vault.modify(file, newContent);
			this.logger.debug('Todo section created', { filePath, lineNumber: insertionPoint, header: targetHeader });
			
			return insertionPoint;

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'findOrCreateTodoSection',
				timestamp: new Date().toISOString(),
				details: { filePath, sectionHeader, error },
			};
			this.logger.error('Failed to find or create Todo section', context);
			throw error;
		}
	}

	async addTaskToTodoSection(filePath: string, taskTitle: string, taskSectionHeading?: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			// Use provided task section heading or fallback to default
			const sectionHeader = taskSectionHeading || TODO_SECTION_HEADER;

			// Find Todo section
			const todoSectionLine = await this.findOrCreateTodoSection(filePath, sectionHeader);
			
			// Re-read the file content after potentially creating a new section
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			// Find insertion point within Todo section
			let insertionLine = todoSectionLine + 1;
			
			// Skip to after existing tasks
			for (let i = todoSectionLine + 1; i < lines.length; i++) {
				const line = lines[i].trim();
				
				// Stop if we hit another section header
				if (line.startsWith('#') && line !== sectionHeader) {
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
			const taskLine = `- [ ] ${taskTitle}`;
			
			this.logger.info('[DEBUG] Creating task line', {
				taskTitle,
				taskLine,
				insertionLine
			});

			// Insert the task
			lines.splice(insertionLine, 0, taskLine);
			const newContent = lines.join('\n');

			await this.app.vault.modify(file, newContent);
			this.logger.info('Task added to Todo section', { 
				filePath, 
				taskTitle, 
				lineNumber: insertionLine,
				sectionHeader
			});

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'addTaskToTodoSection',
				timestamp: new Date().toISOString(),
				details: { filePath, taskTitle, taskSectionHeading, error },
			};
			this.logger.error('Failed to add task to Todo section', context);
			throw error;
		}
	}

	async getDailyNoteTasks(filePath: string, taskSectionHeading?: string): Promise<DailyNoteTask[]> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				this.logger.debug('Daily note file not found', { filePath });
				return [];
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const tasks: DailyNoteTask[] = [];

			// Extract date from filename for startDate
			const startDate = this.extractDateFromFilename(filePath);

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
				const taskMatch = line.match(TASK_REGEX);

				if (taskMatch) {
					const [, indent, completed, title, completionDate] = taskMatch;
					
					// Skip empty or whitespace-only tasks
					const cleanTitle = title.trim();
					if (!cleanTitle || cleanTitle.length === 0) {
						this.logger.debug(`Skipping empty task at line ${i + 1} in ${filePath}`);
						continue;
					}
					
					const task: DailyNoteTask = {
						title: cleanTitle,
						completed: completed === 'x',
						lineNumber: i,
						completionDate: completionDate || undefined,
						startDate: startDate,
						filePath: filePath,
					};

					tasks.push(task);
				}
			}

			// Only log if there are tasks
			if (tasks.length > 0) {
				const sectionInfo = taskSectionHeading ? ` in section "${taskSectionHeading}"` : '';
				this.logger.debug('Parsed daily note tasks', { 
					filePath, 
					taskCount: tasks.length,
					section: sectionInfo
				});
			}

			return tasks;

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'getDailyNoteTasks',
				timestamp: new Date().toISOString(),
				details: { filePath, taskSectionHeading, error },
			};
			this.logger.error('Failed to get daily note tasks', context);
			throw error;
		}
	}

	async getAllDailyNoteTasks(taskSectionHeading?: string): Promise<DailyNoteTask[]> {
		try {
			const allTasks: DailyNoteTask[] = [];
			
			// Get all markdown files in daily notes folder
			const dailyNotesFiles = await this.getAllDailyNoteFiles();
			
			// Process each file to extract tasks
			for (const file of dailyNotesFiles) {
				try {
					const tasks = await this.getDailyNoteTasks(file.path, taskSectionHeading);
					allTasks.push(...tasks);
				} catch (error) {
					this.logger.warn(`Failed to get tasks from ${file.path}`, { error });
					// Continue processing other files
				}
			}

			this.logger.info('Retrieved all daily note tasks', { 
				fileCount: dailyNotesFiles.length,
				taskCount: allTasks.length 
			});

			return allTasks;

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'getAllDailyNoteTasks',
				timestamp: new Date().toISOString(),
				details: { taskSectionHeading, error },
			};
			this.logger.error('Failed to get all daily note tasks', context);
			throw error;
		}
	}

	async getAllDailyNoteFiles(): Promise<TFile[]> {
		try {
			const dailyNotesFolder = this.app.vault.getAbstractFileByPath(this.dailyNotesPath);
			
			if (!dailyNotesFolder) {
				this.logger.warn('Daily notes folder not found', { 
					dailyNotesPath: this.dailyNotesPath 
				});
				return [];
			}

			const markdownFiles: TFile[] = [];
			
			// Get all files in the vault and filter for daily notes folder
			const allFiles = this.app.vault.getMarkdownFiles();
			
			for (const file of allFiles) {
				// Check if file is in the daily notes folder
				if (!file.path.startsWith(this.dailyNotesPath + '/')) continue;
				
				// Check if filename looks like a date
				if (!this.isDateFilename(file.name)) continue;
				
				markdownFiles.push(file);
			}

			this.logger.debug('Found daily note files', { 
				folderPath: this.dailyNotesPath,
				fileCount: markdownFiles.length 
			});

			return markdownFiles;

		} catch (error) {
			const context: ErrorContext = {
				component: 'DailyNoteManager',
				method: 'getAllDailyNoteFiles',
				timestamp: new Date().toISOString(),
				details: { dailyNotesPath: this.dailyNotesPath, error },
			};
			this.logger.error('Failed to get daily note files', context);
			throw error;
		}
	}

	extractDateFromFilename(filePath: string): string | undefined {
		const fileName = filePath.split('/').pop()?.replace('.md', '') || '';
		
		// Try various date formats commonly used in daily notes
		const dateFormats = [
			/^(\d{4}-\d{2}-\d{2})$/,           // YYYY-MM-DD
			/^(\d{2}-\d{2}-\d{4})$/,           // DD-MM-YYYY
			/^(\d{2}\/\d{2}\/\d{4})$/,         // DD/MM/YYYY
			/^(\d{4}\/\d{2}\/\d{2})$/,         // YYYY/MM/DD
			/^(\d{4}\d{2}\d{2})$/,             // YYYYMMDD
		];

		for (const format of dateFormats) {
			const match = fileName.match(format);
			if (match) {
				return this.normalizeDateString(match[1]);
			}
		}

		this.logger.debug('Could not extract date from filename', { fileName });
		return undefined;
	}

	private isDateFilename(filename: string): boolean {
		const nameWithoutExtension = filename.replace('.md', '');
		return this.extractDateFromFilename(nameWithoutExtension + '.md') !== undefined;
	}

	private normalizeDateString(dateString: string): string {
		// Convert various formats to YYYY-MM-DD
		if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
			return dateString; // Already in correct format
		} else if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
			// DD-MM-YYYY to YYYY-MM-DD
			const [day, month, year] = dateString.split('-');
			return `${year}-${month}-${day}`;
		} else if (dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
			// DD/MM/YYYY to YYYY-MM-DD
			const [day, month, year] = dateString.split('/');
			return `${year}-${month}-${day}`;
		} else if (dateString.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
			// YYYY/MM/DD to YYYY-MM-DD
			return dateString.replace(/\//g, '-');
		} else if (dateString.match(/^\d{8}$/)) {
			// YYYYMMDD to YYYY-MM-DD
			return `${dateString.slice(0, 4)}-${dateString.slice(4, 6)}-${dateString.slice(6, 8)}`;
		}
		
		return dateString; // Return as-is if format not recognized
	}

	getNotePath(date: string): string {
		try {
			// Convert date to filename format
			const parsedDate = new Date(date);
			// Check if the date is valid
			if (isNaN(parsedDate.getTime())) {
				throw new Error(`Invalid date: ${date}`);
			}
			const formattedDate = this.formatDate(parsedDate, this.dateFormat);
			// Security check: ensure path doesn't contain traversal attempts
			const safePath = this.sanitizePath(`${this.dailyNotesPath}/${formattedDate}.md`);
			return safePath;
		} catch (error) {
			this.logger.error('Failed to get note path', {
				date,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
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

	private async generateDailyNoteContent(): Promise<string> {
		// If no template specified, use default content
		if (!this.templatePath) {
			return this.generateDefaultDailyNoteContent();
		}

		try {
			const templateContent = await this.loadTemplate();
			if (!templateContent) {
				return this.generateDefaultDailyNoteContent();
			}
			return this.processTemplate(templateContent);
		} catch (error) {
			this.logger.error('Failed to load template, using default content', { 
				templatePath: this.templatePath, 
				error 
			});
			return this.generateDefaultDailyNoteContent();
		}
	}

	private async generateDailyNoteContentForDate(date: Date): Promise<string> {
		// If no template specified, use default content
		if (!this.templatePath) {
			return this.generateDefaultDailyNoteContentForDate(date);
		}

		try {
			const templateContent = await this.loadTemplate();
			if (!templateContent) {
				return this.generateDefaultDailyNoteContentForDate(date);
			}
			return this.processTemplateForDate(templateContent, date);
		} catch (error) {
			this.logger.error('Failed to load template, using default content', { 
				templatePath: this.templatePath, 
				error 
			});
			return this.generateDefaultDailyNoteContentForDate(date);
		}
	}

	private async loadTemplate(): Promise<string | null> {
		if (!this.templatePath) {
			return null;
		}

		try {
			const templateFile = this.app.vault.getAbstractFileByPath(this.templatePath);
			if (!templateFile || !(templateFile instanceof TFile)) {
				this.logger.warn('Template file not found', { templatePath: this.templatePath });
				return null;
			}

			const content = await this.app.vault.read(templateFile);
			this.logger.debug('Template loaded successfully', { templatePath: this.templatePath });
			return content;

		} catch (error) {
			this.logger.error('Error loading template file', { templatePath: this.templatePath, error });
			return null;
		}
	}

	private processTemplate(templateContent: string): string {
		const today = new Date();
		return this.processTemplateForDate(templateContent, today);
	}

	private processTemplateForDate(templateContent: string, date: Date): string {
		// Replace common template variables
		let processedContent = templateContent
			.replace(/\{\{date\}\}/g, this.formatDate(date, this.dateFormat))
			.replace(/\{\{date:YYYY-MM-DD\}\}/g, this.formatDate(date, 'YYYY-MM-DD'))
			.replace(/\{\{date:DD-MM-YYYY\}\}/g, this.formatDate(date, 'DD-MM-YYYY'))
			.replace(/\{\{date:MM-DD-YYYY\}\}/g, this.formatDate(date, 'MM-DD-YYYY'))
			.replace(/\{\{date:YYYY\/MM\/DD\}\}/g, this.formatDate(date, 'YYYY/MM/DD'))
			.replace(/\{\{title\}\}/g, `Daily Note - ${this.formatDate(date, 'MMMM Do, YYYY')}`)
			.replace(/\{\{time\}\}/g, this.formatTime(date))
			.replace(/\{\{timestamp\}\}/g, this.formatTimestamp(date));

		this.logger.debug('Template processed successfully', { 
			originalLength: templateContent.length,
			processedLength: processedContent.length,
			date: this.formatDate(date, 'YYYY-MM-DD')
		});

		return processedContent;
	}

	private generateDefaultDailyNoteContent(): string {
		const today = new Date();
		return this.generateDefaultDailyNoteContentForDate(today);
	}

	private generateDefaultDailyNoteContentForDate(date: Date): string {
		const dateString = date.toLocaleDateString('en-US', {
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

	setDateFormat(format: string): void {
		this.dateFormat = format;
		this.logger.debug('Daily notes date format updated', { format });
	}

	getDateFormat(): string {
		return this.dateFormat;
	}

	setTemplatePath(path?: string): void {
		this.templatePath = path;
		this.logger.debug('Daily notes template path updated', { path: path || 'none' });
	}

	getTemplatePath(): string | undefined {
		return this.templatePath;
	}

	updateSettings(path: string, dateFormat: string, templatePath?: string): void {
		this.dailyNotesPath = path;
		this.dateFormat = dateFormat;
		this.templatePath = templatePath;
		this.logger.debug('Daily notes settings updated', { 
			path, 
			dateFormat, 
			templatePath: templatePath || 'none' 
		});
	}

	private formatDate(date: Date, format: string): string {
		// Validate date object
		if (!date || isNaN(date.getTime())) {
			this.logger.error('Invalid date object in formatDate', {
				date: date ? date.toString() : 'null/undefined',
				format
			});
			throw new Error('Invalid date object');
		}

		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');

		switch (format) {
			case 'YYYY-MM-DD':
				return `${year}-${month}-${day}`;
			case 'DD-MM-YYYY':
				return `${day}-${month}-${year}`;
			case 'MM-DD-YYYY':
				return `${month}-${day}-${year}`;
			case 'YYYY/MM/DD':
				return `${year}/${month}/${day}`;
			case 'DD/MM/YYYY':
				return `${day}/${month}/${year}`;
			case 'MM/DD/YYYY':
				return `${month}/${day}/${year}`;
			case 'MMMM Do, YYYY':
				return date.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				});
			default:
				// Fallback to ISO format
				return `${year}-${month}-${day}`;
		}
	}

	private formatTime(date: Date): string {
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	private formatTimestamp(date: Date): string {
		const dateString = this.formatDate(date, 'YYYY-MM-DD');
		const timeString = this.formatTime(date);
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${dateString} ${timeString}:${seconds}`;
	}

	private sanitizePath(path: string): string {
		// Remove any path traversal attempts and dangerous characters
		if (path.includes('..') || path.includes('\\')) {
			throw new Error('Invalid path: Path traversal attempt detected');
		}
		
		// Additional security: ensure path doesn't contain dangerous characters
		if (/[<>:"|?*]/.test(path)) {
			throw new Error('Invalid path: Contains forbidden characters');
		}
		
		return path;
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

	/**
	 * デイリーノートフォルダ内のすべてのファイルを取得
	 * 内部同期で使用するため
	 */
	async getDailyNoteFiles(): Promise<TFile[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.dailyNotesPath);
		if (!folder || !(folder instanceof TFolder)) {
			this.logger.warn('Daily notes folder not found', { path: this.dailyNotesPath });
			return [];
		}

		const files: TFile[] = [];
		Vault.recurseChildren(folder, (child) => {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			}
		});

		return files;
	}
}