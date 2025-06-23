// Todo Synchronizer for bidirectional sync between Microsoft Todo and Obsidian
// Handles sync logic, duplicate detection, and completion status management

import { TodoApiClient } from '../api/TodoApiClient';
import { DailyNoteManager } from './DailyNoteManager';
import {
	TodoTask,
	DailyNoteTask,
	SyncResult,
	TaskPair,
	Logger,
	ErrorContext,
} from '../types';
import { ERROR_CODES } from '../constants';

export class TodoSynchronizer {
	private apiClient: TodoApiClient;
	private dailyNoteManager: DailyNoteManager;
	private logger: Logger;
	private taskSectionHeading?: string;

	constructor(
		apiClient: TodoApiClient,
		dailyNoteManager: DailyNoteManager,
		logger: Logger,
		taskSectionHeading?: string
	) {
		this.apiClient = apiClient;
		this.dailyNoteManager = dailyNoteManager;
		this.logger = logger;
		this.taskSectionHeading = taskSectionHeading;
	}

	setTaskSectionHeading(taskSectionHeading: string): void {
		this.taskSectionHeading = taskSectionHeading;
		this.logger.debug('Task section heading updated', { taskSectionHeading });
	}

	async performFullSync(): Promise<SyncResult> {
		const startTime = new Date().toISOString();
		this.logger.info('Starting full synchronization');

		try {
			// Ensure today's daily note exists
			await this.dailyNoteManager.ensureTodayNoteExists();

			// Perform sync operations in sequence
			const msftToObsidian = await this.syncMsftToObsidian();
			const obsidianToMsft = await this.syncObsidianToMsft();
			const completions = await this.syncCompletions();

			const result: SyncResult = {
				msftToObsidian,
				obsidianToMsft,
				completions,
				timestamp: startTime,
			};

			this.logger.info('Full synchronization completed', { result });
			return result;

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoSynchronizer',
				method: 'performFullSync',
				timestamp: new Date().toISOString(),
				details: { error },
			};
			this.logger.error('Full synchronization failed', context);
			throw error;
		}
	}

	async syncMsftToObsidian(): Promise<{ added: number; errors: string[] }> {
		this.logger.info('Syncing Microsoft tasks to Obsidian');
		const errors: string[] = [];
		let added = 0;

		try {
			// Get tasks from both sources
			const [msftTasks, allDailyTasks] = await Promise.all([
				this.apiClient.getTasks(),
				this.dailyNoteManager.getAllDailyNoteTasks(this.taskSectionHeading),
			]);
			
			// Log Microsoft Todo tasks for debugging
			this.logger.info('Microsoft Todo tasks retrieved', {
				count: msftTasks.length,
				tasks: msftTasks.map(t => ({ id: t.id, title: t.title }))
			});

			// Find new Microsoft tasks that don't exist in Obsidian
			const newMsftTasks = this.findNewMsftTasks(msftTasks, allDailyTasks);

			// Add each new task to the appropriate daily note based on creation date
			for (const task of newMsftTasks) {
				try {
					// Extract date from Microsoft Todo task creation date
					const taskStartDate = new Date(task.createdDateTime).toISOString().slice(0, 10);
					const targetNotePath = this.dailyNoteManager.getNotePath(taskStartDate);
					
					// Ensure the target note exists
					await this.ensureNoteExists(targetNotePath, taskStartDate);
					
					const cleanedTitle = this.cleanTaskTitle(task.title);
					await this.dailyNoteManager.addTaskToTodoSection(
						targetNotePath,
						cleanedTitle,
						task.id,
						this.taskSectionHeading
					);
					added++;
					this.logger.debug('Added Microsoft task to Obsidian', { 
						taskId: task.id, 
						originalTitle: task.title,
						cleanedTitle: cleanedTitle,
						targetNote: targetNotePath,
						startDate: taskStartDate
					});
				} catch (error) {
					const errorMsg = `Failed to add task "${task.title}": ${error instanceof Error ? error.message : 'Unknown error'}`;
					errors.push(errorMsg);
					this.logger.error('Failed to add Microsoft task to Obsidian', {
						taskId: task.id,
						title: task.title,
						error,
					});
				}
			}

			this.logger.info('Microsoft to Obsidian sync completed', { added, errors: errors.length });
			return { added, errors };

		} catch (error) {
			const errorMsg = `Microsoft to Obsidian sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
			errors.push(errorMsg);
			this.logger.error('Microsoft to Obsidian sync failed', { error });
			return { added, errors };
		}
	}

	async syncObsidianToMsft(): Promise<{ added: number; errors: string[] }> {
		this.logger.info('Syncing Obsidian tasks to Microsoft');
		const errors: string[] = [];
		let added = 0;

		try {
			// Get all daily note tasks from all files
			const allDailyTasks = await this.dailyNoteManager.getAllDailyNoteTasks(this.taskSectionHeading);

			// Find new Obsidian tasks (those without todoId)
			const newObsidianTasks = allDailyTasks.filter(task => !task.todoId && !task.completed);

			// Get default list ID
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No default Microsoft Todo list configured');
			}

			// Get existing Microsoft tasks to check for duplicates
			const existingMsftTasks = await this.apiClient.getTasks();
			const existingTitles = new Set(
				existingMsftTasks.map(task => this.normalizeTitle(this.cleanTaskTitle(task.title)))
			);

			// Create each new task in Microsoft Todo with start date
			for (const task of newObsidianTasks) {
				// Skip if task already exists in Microsoft Todo (by normalized title)
				if (existingTitles.has(this.normalizeTitle(task.title))) {
					this.logger.debug('Skipping task - already exists in Microsoft Todo', {
						taskTitle: task.title
					});
					continue;
				}
				try {
					const createdTask = await this.apiClient.createTaskWithStartDate(
						listId, 
						task.title,
						task.startDate
					);
					
					// Update the task line in Obsidian to include the Microsoft Todo ID
					await this.updateTaskWithTodoId(task.filePath!, task.lineNumber, createdTask.id);
					
					added++;
					this.logger.debug('Added Obsidian task to Microsoft', { 
						taskTitle: task.title,
						msftTaskId: createdTask.id,
						startDate: task.startDate,
						filePath: task.filePath
					});
				} catch (error) {
					const errorMsg = `Failed to add task "${task.title}": ${error instanceof Error ? error.message : 'Unknown error'}`;
					errors.push(errorMsg);
					this.logger.error('Failed to add Obsidian task to Microsoft', {
						taskTitle: task.title,
						error,
					});
				}
			}

			this.logger.info('Obsidian to Microsoft sync completed', { added, errors: errors.length });
			return { added, errors };

		} catch (error) {
			const errorMsg = `Obsidian to Microsoft sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
			errors.push(errorMsg);
			this.logger.error('Obsidian to Microsoft sync failed', { error });
			return { added, errors };
		}
	}

	async syncCompletions(): Promise<{ completed: number; errors: string[] }> {
		this.logger.info('Syncing completion status');
		const errors: string[] = [];
		let completed = 0;

		try {
			const [msftTasks, allDailyTasks] = await Promise.all([
				this.apiClient.getTasks(),
				this.dailyNoteManager.getAllDailyNoteTasks(this.taskSectionHeading),
			]);

			// Create lookup maps
			const msftTasksById = new Map(msftTasks.map(task => [task.id, task]));
			const dailyTasksById = new Map(
				allDailyTasks
					.filter(task => task.todoId)
					.map(task => [task.todoId!, task])
			);

			const listId = this.apiClient.getDefaultListId();

			// Sync Microsoft completions to Obsidian
			for (const msftTask of msftTasks) {
				const dailyTask = dailyTasksById.get(msftTask.id);
				if (!dailyTask) continue;

				const msftCompleted = msftTask.status === 'completed';
				
				if (msftCompleted && !dailyTask.completed) {
					try {
						const completionDate = msftTask.completedDateTime 
							? new Date(msftTask.completedDateTime).toISOString().slice(0, 10)
							: new Date().toISOString().slice(0, 10);

						await this.dailyNoteManager.updateTaskCompletion(
							dailyTask.filePath!,
							dailyTask.lineNumber,
							true,
							completionDate
						);
						completed++;
						this.logger.debug('Marked Obsidian task as completed from Microsoft', {
							taskId: msftTask.id,
							title: msftTask.title,
							filePath: dailyTask.filePath
						});
					} catch (error) {
						const errorMsg = `Failed to complete task "${msftTask.title}": ${error instanceof Error ? error.message : 'Unknown error'}`;
						errors.push(errorMsg);
					}
				}
			}

			// Sync Obsidian completions to Microsoft (matching by title and start date)
			for (const dailyTask of allDailyTasks) {
				if (!dailyTask.completed || dailyTask.todoId) continue; // Skip incomplete tasks or tasks already synced
				
				// Find matching Microsoft task by title and creation date
				const matchingMsftTask = msftTasks.find(msftTask => {
					const msftStartDate = new Date(msftTask.createdDateTime).toISOString().slice(0, 10);
					return this.normalizeTitle(msftTask.title) === this.normalizeTitle(dailyTask.title) &&
						   msftStartDate === dailyTask.startDate &&
						   msftTask.status !== 'completed';
				});

				if (matchingMsftTask) {
					try {
						if (!listId) {
							throw new Error('No default list ID available');
						}

						await this.apiClient.completeTask(listId, matchingMsftTask.id);
						completed++;
						this.logger.debug('Marked Microsoft task as completed from Obsidian', {
							taskId: matchingMsftTask.id,
							title: dailyTask.title,
							filePath: dailyTask.filePath
						});
					} catch (error) {
						const errorMsg = `Failed to complete Microsoft task "${dailyTask.title}": ${error instanceof Error ? error.message : 'Unknown error'}`;
						errors.push(errorMsg);
					}
				}
			}

			this.logger.info('Completion sync completed', { completed, errors: errors.length });
			return { completed, errors };

		} catch (error) {
			const errorMsg = `Completion sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
			errors.push(errorMsg);
			this.logger.error('Completion sync failed', { error });
			return { completed, errors };
		}
	}

	detectDuplicates(obsidianTasks: DailyNoteTask[], msftTasks: TodoTask[]): TaskPair[] {
		const duplicates: TaskPair[] = [];

		for (const obsidianTask of obsidianTasks) {
			// Skip tasks that already have a Microsoft Todo ID
			if (obsidianTask.todoId) continue;

			for (const msftTask of msftTasks) {
				// Simple title matching for now
				const titleMatch = this.normalizeTitle(obsidianTask.title) === this.normalizeTitle(msftTask.title);
				
				if (titleMatch) {
					duplicates.push({
						obsidianTask,
						msftTask,
						confidence: 1.0, // Exact title match
					});
					break; // Only match each Obsidian task once
				}
			}
		}

		this.logger.debug('Detected duplicates', { count: duplicates.length });
		return duplicates;
	}

	private findNewMsftTasks(msftTasks: TodoTask[], dailyTasks: DailyNoteTask[]): TodoTask[] {
		const existingTaskIds = new Set(
			dailyTasks
				.filter(task => task.todoId)
				.map(task => task.todoId)
		);

		const existingTitles = new Set(
			dailyTasks.map(task => this.normalizeTitle(task.title))
		);

		return msftTasks.filter(task => 
			!existingTaskIds.has(task.id) && 
			!existingTitles.has(this.normalizeTitle(this.cleanTaskTitle(task.title)))
		);
	}

	private async updateTaskWithTodoId(filePath: string, lineNumber: number, todoId: string): Promise<void> {
		try {
			// Get access to DailyNoteManager's app instance
			const app = (this.dailyNoteManager as any).app;
			
			// Read the file content
			const file = app.vault.getAbstractFileByPath(filePath);
			if (!file) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await app.vault.read(file);
			const lines = content.split('\n');

			if (lineNumber >= lines.length) {
				throw new Error(`Line number ${lineNumber} is out of bounds`);
			}

			// Update the specific line to add the todo ID
			const currentLine = lines[lineNumber];
			
			// Check if todo ID already exists to avoid duplicates
			if (currentLine.includes('[todo::')) {
				this.logger.debug('Task already has todo ID, skipping update', { filePath, lineNumber, todoId });
				return;
			}

			// Add todo ID to the end of the task line
			const updatedLine = currentLine + ` [todo::${todoId}]`;
			lines[lineNumber] = updatedLine;

			// Write the updated content back to the file
			const newContent = lines.join('\n');
			await app.vault.modify(file, newContent);

			this.logger.debug('Updated task with todo ID', { filePath, lineNumber, todoId });
		} catch (error) {
			this.logger.error('Failed to update task with todo ID', { filePath, lineNumber, todoId, error });
			throw error;
		}
	}

	private async ensureNoteExists(notePath: string, date: string): Promise<void> {
		try {
			// Get access to DailyNoteManager's app instance
			const app = (this.dailyNoteManager as any).app;
			
			const file = app.vault.getAbstractFileByPath(notePath);
			if (file) {
				this.logger.debug('Note already exists', { notePath });
				return;
			}

			// Create the note with basic daily note structure
			const dateObj = new Date(date);
			const defaultContent = await this.generateDailyNoteContent(dateObj);
			
			await app.vault.create(notePath, defaultContent);
			this.logger.info('Created daily note', { notePath, date });
		} catch (error) {
			this.logger.error('Failed to ensure note exists', { notePath, date, error });
			throw error;
		}
	}

	private async generateDailyNoteContent(date: Date): Promise<string> {
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

	private normalizeTitle(title: string): string {
		return title.trim().toLowerCase().replace(/\s+/g, ' ');
	}

	private cleanTaskTitle(title: string): string {
		// Remove [todo::ID] pattern from the title
		const cleaned = title.replace(/\s*\[todo::[^\]]+\]\s*/g, '').replace(/\s+/g, ' ').trim();
		this.logger.debug('Cleaning task title', { original: title, cleaned });
		return cleaned;
	}
}