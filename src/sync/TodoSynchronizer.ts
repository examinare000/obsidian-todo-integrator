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
				// 後方互換性のための集計フィールド
				added: msftToObsidian.added + obsidianToMsft.added,
				completed: completions.completed,
				errors: [...msftToObsidian.errors, ...obsidianToMsft.errors, ...completions.errors],
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
					// Microsoft Todoタスクから日付を抽出 - 期日を優先、なければ作成日を使用
					let taskDate: string;
					if (task.dueDateTime) {
						// dueDateTimeから日付部分を抽出
						// Microsoft TodoはUTCタイムスタンプを使用するが、終日タスクの場合は
						// タイムゾーン変換をせずに日付部分を直接使用する必要がある
						const dueDateTimeStr = task.dueDateTime.dateTime;
						const timeZone = task.dueDateTime.timeZone;
						
						// Microsoft Todoでは、特定時刻のあるタスクは15:00:00 UTCとして表示されることが多い
						// これはユーザーのローカルタイムゾーンでの終日タスクを表している
						// タイムゾーン変換の問題を避けるため、常に日付部分を直接使用
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
					
					// ターゲットノートが存在することを確認
					await this.ensureNoteExists(targetNotePath, taskDate);
					
					const cleanedTitle = this.cleanTaskTitle(task.title);
					
					// 未完了タスクとして追加
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
					
					// このタスクのメタデータを保存
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
			// 全てのファイルからデイリーノートタスクを取得
			const allDailyTasks = await this.dailyNoteManager.getAllDailyNoteTasks(this.taskSectionHeading);

			// 新規Obsidianタスクを検索（メタデータがないもの）
			const newObsidianTasks = allDailyTasks.filter(task => {
				if (task.completed || !task.startDate) return false;
				// メタデータ検索時にクリーンなタイトルを使用して既存タスクを確認
				// これにより、ユーザーが[todo::ID]を追加/削除しても重複作成を防げる
				//
				// 検討したが採用しなかった代替案:
				// 1. IDを含む完全なタイトルで比較
				//    → 却下理由: 既存タスクにIDを追加した時に重複が作成される
				// 2. タスク内容のハッシュで重複排除
				//    → 却下理由: 現在のデータモデルにタスク内容が含まれていない
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

			// デフォルトリストIDを取得
			const listId = this.apiClient.getDefaultListId();
			if (!listId) {
				throw new Error('デフォルトのMicrosoft Todoリストが設定されていません');
			}

			// 重複チェック用に既存のMicrosoftタスクを取得
			const existingMsftTasks = await this.apiClient.getTasks();
			const existingTitles = new Set(
				existingMsftTasks.map(task => this.normalizeTitle(this.cleanTaskTitle(task.title)))
			);

			// 各新規タスクを開始日付きでMicrosoft Todoに作成
			for (const task of newObsidianTasks) {
				// 正規化したタイトルでMicrosoft Todoに既に存在する場合はスキップ
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
					
					// このタスクのメタデータを保存
					// クリーンなタイトル（[todo::ID]なし）で保存して一貫した検索を保証
					// これは完了状態同期が正しく動作するために重要
					//
					// 検討したが採用しなかった代替案:
					// 1. 元のタイトルで保存し、検索時にクリーン化
					//    → 却下理由: 後でIDが追加/削除された時にタスクが見つからなくなる
					// 2. 各タスクに一意のハッシュを生成
					//    → 却下理由: 複雑性が増し、手動でのタイトル編集に対応できない
					// 3. タスク内容を追加の照合条件として使用
					//    → 却下理由: 現在のデータモデルにタスク内容が含まれていない
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
		this.logger.info('完了状態を同期中');
		const errors: string[] = [];
		let completed = 0;

		try {
			const [msftTasks, allDailyTasks] = await Promise.all([
				this.apiClient.getTasks(),
				this.dailyNoteManager.getAllDailyNoteTasks(this.taskSectionHeading),
			]);

			// 検索用マップを作成
			const msftTasksById = new Map(msftTasks.map(task => [task.id, task]));

			const listId = this.apiClient.getDefaultListId();

			// Microsoft完了タスクをObsidianに同期
			for (const msftTask of msftTasks) {
				// メタデータを使用して対応するObsidianタスクを検索
				const metadata = this.metadataStore.findByMsftTaskId(msftTask.id);
				if (!metadata) {
					this.logger.debug('No metadata found for Microsoft task', {
						taskId: msftTask.id,
						title: msftTask.title,
						status: msftTask.status
					});
					continue;
				}
				
				// デイリーノートから実際のタスクを検索
				// メタデータのクリーンなタイトルと照合するためObsidianタスクのタイトルをクリーン化
				// これによりObsidianタスクに[todo::ID]があってもMicrosoft → Obsidian同期が動作する
				//
				// 検討したが採用しなかった代替案:
				// 1. cleanTaskTitle()の代わりにnormalizeTitle()を使用
				//    → 却下理由: normalizeTitle は小文字化のみで[todo::ID]パターンを除去しない
				// 2. メタデータにタスクの行番号を保存
				//    → 却下理由: ユーザーがファイルを編集すると行番号が変わり、メタデータが古くなる
				// 3. あいまい一致や正規表現パターンを使用
				//    → 却下理由: 間違ったタスクにマッチしてデータ破損を引き起こす可能性がある
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

			// Obsidian完了タスクをMicrosoftに同期
			for (const dailyTask of allDailyTasks) {
				if (!dailyTask.completed || !dailyTask.startDate) continue;
				
				// メタデータからMicrosoftタスクIDを検索
				// メタデータはクリーンなタイトルで保存されているため、検索前にタイトルをクリーン化
				// これによりObsidianでの[todo::ID]の有無に関わらず一貫した照合が可能
				//
				// 検討したが採用しなかった代替案:
				// 1. メタデータに元のタイトルとクリーンなタイトルの両方を保存
				//    → 却下理由: ストレージの複雑性が増し、既存ユーザーのマイグレーションが必要
				// 2. メタデータを元のタイトルで保存し、比較時にクリーン化
				//    → 却下理由: 検索のたびにクリーン化が必要でパフォーマンスに影響
				//    → また、同じタスクにIDが追加/削除された時に重複エントリが作成される
				// 3. Microsoft To-DoのタイトルからIDを削除
				//    → 却下理由: ユーザーが他のワークフローでMicrosoft To-DoでIDを見たい場合がある
				// 4. タイトルに埋め込む代わりに別のIDフィールドを使用
				//    → 却下理由: 既存のタスク形式に大幅な変更が必要
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
		// First remove [todo::...] patterns, then normalize whitespace
		let cleaned = title;
		
		// Remove all [todo::...] patterns
		cleaned = cleaned.replace(/\[todo::[^\]]*\]/g, '');
		
		// Normalize whitespace - replace multiple spaces with single space
		cleaned = cleaned.replace(/\s+/g, ' ');
		
		// Trim leading and trailing whitespace
		cleaned = cleaned.trim();
		
		this.logger.debug('Cleaning task title', { original: title, cleaned });
		return cleaned;
	}
}