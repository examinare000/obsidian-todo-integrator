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
			const [msftTasks, dailyTasks] = await Promise.all([
				this.apiClient.getTasks(),
				this.dailyNoteManager.getDailyNoteTasks(this.dailyNoteManager.getTodayNotePath(), this.taskSectionHeading),
			]);

			// Find new Microsoft tasks that don't exist in Obsidian
			const newMsftTasks = this.findNewMsftTasks(msftTasks, dailyTasks);

			// Add each new task to the daily note
			const todayPath = this.dailyNoteManager.getTodayNotePath();
			
			for (const task of newMsftTasks) {
				try {
					await this.dailyNoteManager.addTaskToTodoSection(
						todayPath,
						task.title,
						task.id,
						this.taskSectionHeading
					);
					added++;
					this.logger.debug('Added Microsoft task to Obsidian', { 
						taskId: task.id, 
						title: task.title 
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
			// Get daily note tasks
			const dailyTasks = await this.dailyNoteManager.getDailyNoteTasks(
				this.dailyNoteManager.getTodayNotePath(),
				this.taskSectionHeading
			);

			// Find new Obsidian tasks (those without todoId)
			const newObsidianTasks = dailyTasks.filter(task => !task.todoId && !task.completed);

			// Get default list ID
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('No default Microsoft Todo list configured');
			}

			// Create each new task in Microsoft Todo
			const todayPath = this.dailyNoteManager.getTodayNotePath();

			for (const task of newObsidianTasks) {
				try {
					const createdTask = await this.apiClient.createTask(listId, task.title);
					
					// Update the task line in Obsidian to include the Microsoft Todo ID
					await this.updateTaskWithTodoId(todayPath, task.lineNumber, createdTask.id);
					
					added++;
					this.logger.debug('Added Obsidian task to Microsoft', { 
						taskTitle: task.title,
						msftTaskId: createdTask.id 
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
			const [msftTasks, dailyTasks] = await Promise.all([
				this.apiClient.getTasks(),
				this.dailyNoteManager.getDailyNoteTasks(this.dailyNoteManager.getTodayNotePath(), this.taskSectionHeading),
			]);

			// Create lookup maps
			const msftTasksById = new Map(msftTasks.map(task => [task.id, task]));
			const dailyTasksById = new Map(
				dailyTasks
					.filter(task => task.todoId)
					.map(task => [task.todoId!, task])
			);

			const todayPath = this.dailyNoteManager.getTodayNotePath();
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
							todayPath,
							dailyTask.lineNumber,
							true,
							completionDate
						);
						completed++;
						this.logger.debug('Marked Obsidian task as completed from Microsoft', {
							taskId: msftTask.id,
							title: msftTask.title,
						});
					} catch (error) {
						const errorMsg = `Failed to complete task "${msftTask.title}": ${error instanceof Error ? error.message : 'Unknown error'}`;
						errors.push(errorMsg);
					}
				}
			}

			// Sync Obsidian completions to Microsoft
			for (const dailyTask of dailyTasks) {
				if (!dailyTask.todoId) continue;
				
				const msftTask = msftTasksById.get(dailyTask.todoId);
				if (!msftTask) continue;

				const msftCompleted = msftTask.status === 'completed';
				
				if (dailyTask.completed && !msftCompleted) {
					try {
						if (!listId) {
							throw new Error('No default list ID available');
						}

						await this.apiClient.completeTask(listId, dailyTask.todoId);
						completed++;
						this.logger.debug('Marked Microsoft task as completed from Obsidian', {
							taskId: dailyTask.todoId,
							title: dailyTask.title,
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
			!existingTitles.has(this.normalizeTitle(task.title))
		);
	}

	private async updateTaskWithTodoId(filePath: string, lineNumber: number, todoId: string): Promise<void> {
		try {
			// This is a simplified implementation
			// In a real implementation, you'd want to read the file, update the specific line
			// to add the [todo::id] part, and write it back
			this.logger.debug('Would update task with todo ID', { filePath, lineNumber, todoId });
			
			// For now, we'll leave this as a placeholder since the full implementation
			// would require more complex file manipulation
		} catch (error) {
			this.logger.error('Failed to update task with todo ID', { filePath, lineNumber, todoId, error });
			throw error;
		}
	}

	private normalizeTitle(title: string): string {
		return title.trim().toLowerCase().replace(/\s+/g, ' ');
	}
}