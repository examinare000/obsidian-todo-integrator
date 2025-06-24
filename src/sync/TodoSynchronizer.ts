// Todo Synchronizer for bidirectional sync between Microsoft Todo and Obsidian
// Handles sync logic, duplicate detection, and completion status management

import { App, Plugin } from 'obsidian';
import { TodoApiClient } from '../api/TodoApiClient';
import { DailyNoteManager } from './DailyNoteManager';
import { TaskMetadataStore } from './TaskMetadataStore';
import { SimpleLogger } from '../utils/simpleLogger';
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
	private metadataStore: TaskMetadataStore;
	private logger: Logger;
	private taskSectionHeading?: string;

	constructor(
		apiClient: TodoApiClient,
		dailyNoteManager: DailyNoteManager,
		logger: Logger,
		taskSectionHeading: string | undefined,
		plugin: Plugin
	) {
		this.apiClient = apiClient;
		this.dailyNoteManager = dailyNoteManager;
		this.logger = logger;
		this.taskSectionHeading = taskSectionHeading;
		// Initialize metadata store with plugin instance
		this.metadataStore = new TaskMetadataStore(plugin, logger as SimpleLogger);
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

			// Clean up old metadata (older than 90 days)
			await this.metadataStore.cleanupOldMetadata();

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
			
			// Log Microsoft Todo tasks for debugging (temporarily using info level)
			this.logger.info('[DEBUG] Microsoft Todo tasks retrieved', {
				count: msftTasks.length,
				tasks: msftTasks.map(t => ({ id: t.id, title: t.title }))
			});
			
			// Clean up Microsoft Todo task titles if they contain [todo:: tags
			const listId = this.apiClient.getDefaultListId();
			if (listId) {
				for (const task of msftTasks) {
					if (task.title.includes('[todo::')) {
						const cleanedTitle = this.cleanTaskTitle(task.title);
						try {
							await this.apiClient.updateTaskTitle(listId, task.id, cleanedTitle);
							this.logger.info('[DEBUG] Cleaned Microsoft Todo task title', {
								taskId: task.id,
								originalTitle: task.title,
								cleanedTitle: cleanedTitle
							});
							// Update the task object with cleaned title
							task.title = cleanedTitle;
						} catch (error) {
							this.logger.error('Failed to clean Microsoft Todo task title', {
								taskId: task.id,
								title: task.title,
								error
							});
						}
					}
				}
			}

			// Find new Microsoft tasks that don't exist in Obsidian (only incomplete tasks)
			const newMsftTasks = this.findNewMsftTasks(msftTasks, allDailyTasks)
				.filter(task => task.status !== 'completed');

			// Add each new task to the appropriate daily note based on due date (fallback to creation date)
			for (const task of newMsftTasks) {
				try {
					// Extract date from Microsoft Todo task - prefer due date, fallback to creation date
					const taskDate = task.dueDateTime 
						? new Date(task.dueDateTime.dateTime).toISOString().slice(0, 10)
						: new Date(task.createdDateTime).toISOString().slice(0, 10);
					const targetNotePath = this.dailyNoteManager.getNotePath(taskDate);
					
					// Ensure the target note exists
					await this.ensureNoteExists(targetNotePath, taskDate);
					
					const cleanedTitle = this.cleanTaskTitle(task.title);
					
					// Add as incomplete task
					await this.dailyNoteManager.addTaskToTodoSection(
						targetNotePath,
						cleanedTitle,
						this.taskSectionHeading
					);
					
					// Store metadata for this task
					await this.metadataStore.setMetadata(taskDate, cleanedTitle, task.id);
					
					added++;
					this.logger.info('[DEBUG] Added Microsoft task to Obsidian', { 
						taskId: task.id, 
						originalTitle: task.title,
						cleanedTitle: cleanedTitle,
						targetNote: targetNotePath,
						taskDate: taskDate,
						dueDate: task.dueDateTime ? new Date(task.dueDateTime.dateTime).toISOString().slice(0, 10) : null,
						createdDate: new Date(task.createdDateTime).toISOString().slice(0, 10)
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

			// Find new Obsidian tasks (those without metadata)
			const newObsidianTasks = allDailyTasks.filter(task => {
				if (task.completed || !task.startDate) return false;
				const existingMsftId = this.metadataStore.getMsftTaskId(task.startDate, task.title);
				return !existingMsftId;
			});

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
					this.logger.info('[DEBUG] Skipping task - already exists in Microsoft Todo', {
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
					
					// Store metadata for this task
					if (task.startDate) {
						await this.metadataStore.setMetadata(task.startDate, task.title, createdTask.id);
					}
					
					added++;
					this.logger.info('[DEBUG] Added Obsidian task to Microsoft', { 
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

			const listId = this.apiClient.getDefaultListId();

			// Sync Microsoft completions to Obsidian
			for (const msftTask of msftTasks) {
				// Find matching Obsidian task using metadata
				const metadata = this.metadataStore.findByMsftTaskId(msftTask.id);
				if (!metadata) continue;
				
				// Find the actual task in daily notes
				const dailyTask = allDailyTasks.find(task => 
					task.startDate === metadata.date && 
					this.normalizeTitle(task.title) === this.normalizeTitle(metadata.title)
				);
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

			// Sync Obsidian completions to Microsoft
			for (const dailyTask of allDailyTasks) {
				if (!dailyTask.completed || !dailyTask.startDate) continue;
				
				// Look up Microsoft task ID from metadata
				const msftTaskId = this.metadataStore.getMsftTaskId(dailyTask.startDate, dailyTask.title);
				if (!msftTaskId) continue;
				
				const matchingMsftTask = msftTasksById.get(msftTaskId);

				if (matchingMsftTask && matchingMsftTask.status !== 'completed') {
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
			// Skip if we already have metadata for this task
			if (obsidianTask.startDate) {
				const existingMsftId = this.metadataStore.getMsftTaskId(obsidianTask.startDate, obsidianTask.title);
				if (existingMsftId) continue;
			}

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
		// Tasks that exist in Microsoft but not in Obsidian
		const newTasks: TodoTask[] = [];
		
		for (const msftTask of msftTasks) {
			const cleanedTitle = this.cleanTaskTitle(msftTask.title);
			// Use due date if available, otherwise use creation date
			const msftTaskDate = msftTask.dueDateTime 
				? new Date(msftTask.dueDateTime.dateTime).toISOString().slice(0, 10)
				: new Date(msftTask.createdDateTime).toISOString().slice(0, 10);
			
			// Check if we have metadata for this task
			const metadata = this.metadataStore.findByMsftTaskId(msftTask.id);
			if (metadata) continue;
			
			// Check if task exists in daily notes by title and date
			const existsInDailyNotes = dailyTasks.some(dailyTask => 
				this.normalizeTitle(dailyTask.title) === this.normalizeTitle(cleanedTitle) &&
				dailyTask.startDate === msftTaskDate
			);
			
			if (!existsInDailyNotes) {
				newTasks.push(msftTask);
			}
		}
		
		return newTasks;
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
		const cleaned = title.replace(/\[todo::[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
		this.logger.info('[DEBUG] Cleaning task title', { original: title, cleaned });
		return cleaned;
	}
}