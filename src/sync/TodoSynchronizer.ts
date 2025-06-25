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
				tasks: msftTasks.map(t => ({ 
					id: t.id, 
					title: t.title,
					status: t.status,
					dueDateTime: t.dueDateTime,
					createdDateTime: t.createdDateTime
				}))
			});
			
			// Clean up Microsoft Todo task titles if they contain [todo:: tags
			await this.cleanMicrosoftTodoTitles(msftTasks)

			// Find new Microsoft tasks that don't exist in Obsidian (only incomplete tasks)
			const newMsftTasks = this.findNewMsftTasks(msftTasks, allDailyTasks)
				.filter(task => task.status !== 'completed');
			
			this.logger.info('[DEBUG] New Microsoft tasks to add to Obsidian', {
				count: newMsftTasks.length,
				tasks: newMsftTasks.map(t => ({ 
					id: t.id, 
					title: t.title,
					dueDateTime: t.dueDateTime,
					createdDateTime: t.createdDateTime
				}))
			});

			// Add each new task to the appropriate daily note based on due date (fallback to creation date)
			for (const task of newMsftTasks) {
				try {
					// Extract date from Microsoft Todo task - prefer due date, fallback to creation date
					let taskDate: string;
					if (task.dueDateTime) {
						// Extract the date part from the dueDateTime
						// Microsoft Todo uses UTC timestamps, but for all-day tasks,
						// we should use the date part directly without timezone conversion
						const dueDateTimeStr = task.dueDateTime.dateTime;
						const timeZone = task.dueDateTime.timeZone;
						
						// For Microsoft Todo, tasks with specific times often appear as 15:00:00 UTC
						// which represents an all-day task in the user's local timezone
						// Always use the date part directly to avoid timezone conversion issues
						taskDate = dueDateTimeStr.split('T')[0];
						
						this.logger.info('[DEBUG] Due date processing', {
							taskId: task.id,
							title: task.title,
							dueDateTimeStr,
							extractedDate: taskDate,
							timeZone: timeZone,
							fullDueDateTime: task.dueDateTime
						});
					} else {
						taskDate = new Date(task.createdDateTime).toISOString().slice(0, 10);
					}
					const targetNotePath = this.dailyNoteManager.getNotePath(taskDate);
					
					// Ensure the target note exists
					await this.ensureNoteExists(targetNotePath, taskDate);
					
					const cleanedTitle = this.cleanTaskTitle(task.title);
					
					// Add as incomplete task
					this.logger.info('[DEBUG] Adding task to Obsidian', {
						targetNotePath,
						cleanedTitle,
						originalTitle: task.title,
						taskId: task.id,
						taskDate
					});
					
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
			this.logger.error('Microsoft to Obsidian sync failed', { 
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined
			});
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
				// Use cleaned title for metadata lookup
				const cleanedTitle = this.cleanTaskTitle(task.title);
				const existingMsftId = this.metadataStore.getMsftTaskId(task.startDate, cleanedTitle);
				return !existingMsftId;
			});
			
			this.logger.info('[DEBUG] New Obsidian tasks to add to Microsoft', {
				count: newObsidianTasks.length,
				tasks: newObsidianTasks.map(t => ({ 
					title: t.title,
					filePath: t.filePath,
					startDate: t.startDate,
					completed: t.completed
				}))
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
					// Use cleaned title for consistency with how we look it up
					if (task.startDate) {
						const cleanedTitle = this.cleanTaskTitle(task.title);
						await this.metadataStore.setMetadata(task.startDate, cleanedTitle, createdTask.id);
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
				if (!metadata) {
					this.logger.debug('No metadata found for Microsoft task', {
						taskId: msftTask.id,
						title: msftTask.title,
						status: msftTask.status
					});
					continue;
				}
				
				// Find the actual task in daily notes
				// Note: metadata.title is already cleaned, so we need to clean the daily task title too
				const dailyTask = allDailyTasks.find(task => 
					task.startDate === metadata.date && 
					this.cleanTaskTitle(task.title) === metadata.title
				);
				if (!dailyTask) {
					this.logger.debug('No matching daily task found for metadata', {
						metadataDate: metadata.date,
						metadataTitle: metadata.title,
						availableTasks: allDailyTasks
							.filter(t => t.startDate === metadata.date)
							.map(t => ({ title: t.title, cleanedTitle: this.cleanTaskTitle(t.title) }))
					});
					continue;
				}

				const msftCompleted = msftTask.status === 'completed';
				
				if (!msftCompleted || dailyTask.completed) continue;
				
				try {
					const completionDate = this.parseCompletionDate(msftTask);
					
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

			// Sync Obsidian completions to Microsoft
			for (const dailyTask of allDailyTasks) {
				if (!dailyTask.completed || !dailyTask.startDate) continue;
				
				// Look up Microsoft task ID from metadata
				// Note: We need to use the cleaned title for metadata lookup since that's how it was stored
				const cleanedTitle = this.cleanTaskTitle(dailyTask.title);
				const msftTaskId = this.metadataStore.getMsftTaskId(dailyTask.startDate, cleanedTitle);
				if (!msftTaskId) {
					this.logger.debug('No metadata found for completed Obsidian task', {
						originalTitle: dailyTask.title,
						cleanedTitle,
						startDate: dailyTask.startDate
					});
					continue;
				}
				
				const matchingMsftTask = msftTasksById.get(msftTaskId);

				if (!matchingMsftTask || matchingMsftTask.status === 'completed') continue;
				
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
			if (!obsidianTask.startDate) continue;
			
			const existingMsftId = this.metadataStore.getMsftTaskId(obsidianTask.startDate, obsidianTask.title);
			if (existingMsftId) continue;

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
			// For due dates, use the date part directly to avoid timezone issues
			const msftTaskDate = msftTask.dueDateTime 
				? msftTask.dueDateTime.dateTime.split('T')[0]
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
			// Use DailyNoteManager to create the note with template support
			await this.dailyNoteManager.createDailyNote(date);
			this.logger.info('Ensured daily note exists', { notePath, date });
		} catch (error) {
			this.logger.error('Failed to ensure note exists', { notePath, date, error });
			throw error;
		}
	}

	private async cleanMicrosoftTodoTitles(tasks: TodoTask[]): Promise<void> {
		const listId = this.apiClient.getDefaultListId();
		if (!listId) return;

		for (const task of tasks) {
			if (!task.title.includes('[todo::')) continue;
			
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

	private normalizeTitle(title: string): string {
		return title.trim().toLowerCase().replace(/\s+/g, ' ');
	}

	private parseCompletionDate(task: TodoTask): string {
		// No completedDateTime provided, use current date
		if (!task.completedDateTime || task.completedDateTime.trim() === '') {
			return new Date().toISOString().slice(0, 10);
		}

		this.logger.debug('Processing completedDateTime', {
			taskId: task.id,
			title: task.title,
			completedDateTime: task.completedDateTime,
			type: typeof task.completedDateTime
		});

		try {
			const parsedDate = new Date(task.completedDateTime);
			
			// Check if the date is valid
			if (isNaN(parsedDate.getTime())) {
				this.logger.warn('Invalid completedDateTime format, using current date', {
					taskId: task.id,
					completedDateTime: task.completedDateTime
				});
				return new Date().toISOString().slice(0, 10);
			}
			
			return parsedDate.toISOString().slice(0, 10);
		} catch (dateError) {
			// Date parsing failed, use current date
			this.logger.warn('Failed to parse completedDateTime, using current date', {
				taskId: task.id,
				completedDateTime: task.completedDateTime,
				error: dateError
			});
			return new Date().toISOString().slice(0, 10);
		}
	}

	private cleanTaskTitle(title: string): string {
		// Remove [todo::ID] pattern from the title
		const cleaned = title.replace(/\[todo::[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
		this.logger.info('[DEBUG] Cleaning task title', { original: title, cleaned });
		return cleaned;
	}
}