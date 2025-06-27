// Todo Synchronizer for bidirectional sync between Microsoft Todo and Obsidian
// Handles sync logic, duplicate detection, and completion status management

import { App, Plugin } from 'obsidian';
import { TodoApiClient } from '../api/TodoApiClient';
import { DailyNoteManager } from './DailyNoteManager';
import { TaskMetadataStore, TaskMetadata } from './TaskMetadataStore';
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
		plugin: Plugin,
		taskSectionHeading?: string
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
	
	async forceSaveMetadata(): Promise<void> {
		await this.metadataStore.forceSaveMetadata();
	}

	async performFullSync(): Promise<SyncResult> {
		const startTime = new Date().toISOString();
		this.logger.info('Starting full synchronization');

		try {
			// Ensure today's daily note exists
			await this.dailyNoteManager.ensureTodayNoteExists();

			// メタデータとデイリーノートの内部同期を実行
			// タスクの削除や変更を検出してメタデータを更新
			await this.reconcileMetadataWithDailyNotes();

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
			
			
			// Clean up Microsoft Todo task titles if they contain [todo:: tags
			await this.cleanMicrosoftTodoTitles(msftTasks)

			// Find new Microsoft tasks that don't exist in Obsidian (only incomplete tasks)
			const newMsftTasks = this.findNewMsftTasks(msftTasks, allDailyTasks)
				.filter(task => task.status !== 'completed');

			// Add each new task to the appropriate daily note based on due date (fallback to creation date)
			for (const task of newMsftTasks) {
				try {
					// Microsoft Todoタスクから日付を抽出 - 期日を優先、なければ作成日を使用
					let taskDate: string;
					if (task.dueDateTime) {
						let dueDateTimeStr = task.dueDateTime.dateTime;
						
						// Microsoft To DoのAPI応答にはZサフィックスがない場合があるため、
						// UTC時間として確実に解析するために追加する
						if (!dueDateTimeStr.endsWith('Z')) {
							dueDateTimeStr += 'Z';
						}
						
						const dueDate = new Date(dueDateTimeStr);
						
						// JavaScriptのDateオブジェクトは自動的にローカルタイムゾーンに変換される
						const year = dueDate.getFullYear();
						const month = String(dueDate.getMonth() + 1).padStart(2, '0');
						const day = String(dueDate.getDate()).padStart(2, '0');
						taskDate = `${year}-${month}-${day}`;
					} else {
						taskDate = new Date(task.createdDateTime).toISOString().slice(0, 10);
					}
					const targetNotePath = this.dailyNoteManager.getNotePath(taskDate);
					
					// ターゲットノートが存在することを確認
					await this.ensureNoteExists(targetNotePath, taskDate);
					
					const cleanedTitle = this.cleanTaskTitle(task.title);
					
					// 未完了タスクとして追加
					
					await this.dailyNoteManager.addTaskToTodoSection(
						targetNotePath,
						cleanedTitle,
						this.taskSectionHeading
					);
					
					// このタスクのメタデータを保存
					await this.metadataStore.setMetadata(taskDate, cleanedTitle, task.id);
					
					added++;
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
			
			// デバッグ用：Microsoft To Doから取得したタスクの詳細
			this.logger.debug('Microsoft To Do tasks for completion sync', {
				taskCount: msftTasks.length,
				completedCount: msftTasks.filter(t => t.status === 'completed').length,
				tasks: msftTasks.map(t => ({
					id: t.id,
					title: t.title,
					status: t.status,
					completedDateTime: t.completedDateTime
				}))
			});

			// 検索用マップを作成
			const msftTasksById = new Map(msftTasks.map(task => [task.id, task]));

			const listId = this.apiClient.getDefaultListId();

			// Microsoft完了タスクをObsidianに同期
			for (const msftTask of msftTasks) {
				// メタデータを使用して対応するObsidianタスクを検索
				const metadata = this.metadataStore.findByMsftTaskId(msftTask.id);
				if (!metadata) {
					// メタデータが見つからない場合、タスク名で検索を試みる（フォールバック）
					const cleanedMsftTitle = this.cleanTaskTitle(msftTask.title);
					this.logger.debug('No metadata found for Microsoft task, attempting title-based search', {
						taskId: msftTask.id,
						title: msftTask.title,
						cleanedTitle: cleanedMsftTitle,
						status: msftTask.status
					});
					
					// タイトルベースの検索を試みる
					const dailyTaskByTitle = allDailyTasks.find(task => 
						this.cleanTaskTitle(task.title) === cleanedMsftTitle
					);
					
					if (dailyTaskByTitle && msftTask.status === 'completed' && !dailyTaskByTitle.completed) {
						// タスクが見つかり、完了同期が必要な場合
						this.logger.info('Found matching task by title, attempting completion sync', {
							msftTaskId: msftTask.id,
							title: cleanedMsftTitle,
							filePath: dailyTaskByTitle.filePath
						});
						
						try {
							const completionDate = this.parseCompletionDate(msftTask);
							await this.dailyNoteManager.updateTaskCompletion(
								dailyTaskByTitle.filePath!,
								dailyTaskByTitle.lineNumber,
								true,
								completionDate
							);
							
							// メタデータを作成して今後の同期のために保存
							if (dailyTaskByTitle.startDate) {
								await this.metadataStore.setMetadata(
									dailyTaskByTitle.startDate,
									cleanedMsftTitle,
									msftTask.id
								);
								this.logger.info('Created missing metadata for task', {
									date: dailyTaskByTitle.startDate,
									title: cleanedMsftTitle,
									msftTaskId: msftTask.id
								});
							}
							
							completed++;
						} catch (error) {
							const errorMsg = `Failed to complete task by title "${cleanedMsftTitle}": ${error instanceof Error ? error.message : 'Unknown error'}`;
							errors.push(errorMsg);
							this.logger.error('Failed to complete task by title', {
								title: cleanedMsftTitle,
								error
							});
						}
					}
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
				// デバッグ用：検索条件をログ出力
				this.logger.debug('Searching for daily task', {
					searchDate: metadata.date,
					searchTitle: metadata.title,
					availableTasksOnDate: allDailyTasks
						.filter(t => t.startDate === metadata.date)
						.map(t => ({ 
							title: t.title, 
							cleanedTitle: this.cleanTaskTitle(t.title),
							completed: t.completed 
						}))
				});
				
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
				
				this.logger.debug('Processing Microsoft task completion sync', {
					taskId: msftTask.id,
					title: msftTask.title,
					msftCompleted,
					obsidianCompleted: dailyTask.completed,
					willSync: msftCompleted && !dailyTask.completed
				});
				
				if (!msftCompleted || dailyTask.completed) {
					this.logger.debug('Skipping task completion sync', {
						taskId: msftTask.id,
						title: msftTask.title,
						msftCompleted,
						dailyTaskCompleted: dailyTask.completed,
						reason: !msftCompleted ? 'Microsoft task not completed' : 'Obsidian task already completed'
					});
					continue;
				}
				
				try {
					this.logger.debug('Starting task completion update', {
						taskId: msftTask.id,
						title: msftTask.title,
						filePath: dailyTask.filePath,
						lineNumber: dailyTask.lineNumber
					});
					
					const completionDate = this.parseCompletionDate(msftTask);
					
					this.logger.debug('Updating task completion', {
						filePath: dailyTask.filePath,
						lineNumber: dailyTask.lineNumber,
						completionDate
					});
					
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
					this.logger.error('Failed to update task completion', {
						taskId: msftTask.id,
						title: msftTask.title,
						error,
						errorMessage: error instanceof Error ? error.message : 'Unknown error'
					});
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
			// For due dates, convert UTC to local timezone to get correct date
			let msftTaskDate: string;
			if (msftTask.dueDateTime) {
				let dueDateTimeStr = msftTask.dueDateTime.dateTime;
				
				// Microsoft To DoのAPI応答にはZサフィックスがない場合があるため、
				// UTC時間として確実に解析するために追加する
				if (!dueDateTimeStr.endsWith('Z')) {
					dueDateTimeStr += 'Z';
				}
				
				const dueDate = new Date(dueDateTimeStr);
				
				// JavaScriptのDateオブジェクトは自動的にローカルタイムゾーンに変換される
				// そのため、getFullYear/getMonth/getDateを使用すれば正しいローカル日付が取得できる
				const year = dueDate.getFullYear();
				const month = String(dueDate.getMonth() + 1).padStart(2, '0');
				const day = String(dueDate.getDate()).padStart(2, '0');
				msftTaskDate = `${year}-${month}-${day}`;
			} else {
				msftTaskDate = new Date(msftTask.createdDateTime).toISOString().slice(0, 10);
			}
			
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
		if (!task.completedDateTime) {
			return new Date().toISOString().slice(0, 10);
		}

		// Handle both string and object formats from Microsoft Graph API
		let dateTimeString: string;
		if (typeof task.completedDateTime === 'object' && 'dateTime' in task.completedDateTime) {
			// Handle object format: { dateTime: string, timeZone: string }
			dateTimeString = (task.completedDateTime as any).dateTime;
		} else if (typeof task.completedDateTime === 'string') {
			dateTimeString = task.completedDateTime;
		} else {
			this.logger.warn('Unexpected completedDateTime format, using current date', {
				taskId: task.id,
				completedDateTime: task.completedDateTime,
				type: typeof task.completedDateTime
			});
			return new Date().toISOString().slice(0, 10);
		}

		// Check for empty string
		if (dateTimeString.trim() === '') {
			return new Date().toISOString().slice(0, 10);
		}

		this.logger.debug('Processing completedDateTime', {
			taskId: task.id,
			title: task.title,
			completedDateTime: task.completedDateTime,
			dateTimeString,
			type: typeof task.completedDateTime
		});

		try {
			const parsedDate = new Date(dateTimeString);
			
			// Check if the date is valid
			if (isNaN(parsedDate.getTime())) {
				this.logger.warn('Invalid completedDateTime format, using current date', {
					taskId: task.id,
					completedDateTime: task.completedDateTime,
					dateTimeString
				});
				return new Date().toISOString().slice(0, 10);
			}
			
			return parsedDate.toISOString().slice(0, 10);
		} catch (dateError) {
			// Date parsing failed, use current date
			this.logger.warn('Failed to parse completedDateTime, using current date', {
				taskId: task.id,
				completedDateTime: task.completedDateTime,
				dateTimeString,
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

	/**
	 * メタデータとデイリーノートの内部同期
	 * タスクの削除や変更を検出してメタデータを更新
	 */
	private async reconcileMetadataWithDailyNotes(): Promise<void> {
		this.logger.info('デイリーノートとメタデータの内部同期を開始');

		try {
			// すべてのデイリーノートファイルを取得
			const dailyNoteFiles = await this.dailyNoteManager.getDailyNoteFiles();
			
			// デイリーノートファイルから日付を抽出
			const existingDates = new Set<string>();
			for (const file of dailyNoteFiles) {
				const date = this.extractDateFromFilename(file.basename);
				if (date) {
					existingDates.add(date);
				}
			}
			
			// すべてのメタデータを取得
			const allMetadata = this.metadataStore.getAllMetadata();
			
			// デイリーノートファイルが存在しない日付のメタデータを削除
			for (const metadata of allMetadata) {
				if (!existingDates.has(metadata.date)) {
					this.logger.info('デイリーノートファイルが存在しない日付のメタデータを削除', {
						date: metadata.date,
						title: metadata.title,
						msftTaskId: metadata.msftTaskId
					});
					await this.metadataStore.removeMetadataByMsftId(metadata.msftTaskId);
				}
			}
			
			// 日付ごとにタスクを処理
			for (const file of dailyNoteFiles) {
				const date = this.extractDateFromFilename(file.basename);
				if (!date) continue;

				// その日のデイリーノートタスクを取得
				const dailyNoteTasks = await this.dailyNoteManager.getDailyNoteTasks(
					file.path,
					this.taskSectionHeading
				);

				// その日のメタデータを取得
				const metadataList = this.metadataStore.getMetadataByDate(date);

				// 位置ベースのマッチングを試みる
				// メタデータとデイリーノートのタスクを順番で比較
				const processedMsftIds = new Set<string>();
				
				// まず、完全一致するタスクをマーク
				for (const metadata of metadataList) {
					const exactMatch = dailyNoteTasks.find(task => task.title === metadata.title);
					if (exactMatch) {
						processedMsftIds.add(metadata.msftTaskId);
					}
				}

				// 位置ベースのマッチング（タスク数が同じ場合）
				if (metadataList.length === dailyNoteTasks.length) {
					for (let i = 0; i < metadataList.length; i++) {
						const metadata = metadataList[i];
						const dailyTask = dailyNoteTasks[i];
						
						if (!processedMsftIds.has(metadata.msftTaskId) && 
							metadata.title !== dailyTask.title) {
							// 位置は同じだがタイトルが異なる
							this.logger.info('位置ベースでタスクタイトルの変更を検出', {
								oldTitle: metadata.title,
								newTitle: dailyTask.title,
								position: i,
								date
							});

							await this.metadataStore.updateMetadataByMsftId(metadata.msftTaskId, {
								title: dailyTask.title
							});
							processedMsftIds.add(metadata.msftTaskId);
						}
					}
				}

				// タスクの削除を検出：メタデータにあってデイリーノートにないタスク
				for (const metadata of metadataList) {
					if (processedMsftIds.has(metadata.msftTaskId)) continue;

					const existsInDailyNote = dailyNoteTasks.some(
						task => task.title === metadata.title
					);

					if (!existsInDailyNote) {
						// タスクが削除された場合の処理を検討
						const possibleMatch = this.findPossibleTaskMatch(metadata, dailyNoteTasks);
						
						if (possibleMatch) {
							// タイトルが変更された可能性
							this.logger.info('タスクタイトルの変更を検出', {
								oldTitle: metadata.title,
								newTitle: possibleMatch.title,
								date
							});

							// メタデータを更新
							await this.metadataStore.updateMetadataByMsftId(metadata.msftTaskId, {
								title: possibleMatch.title
							});
						} else {
							// タスクが完全に削除された
							this.logger.info('タスクの削除を検出', {
								title: metadata.title,
								date
							});

							// メタデータを削除
							await this.metadataStore.removeMetadataByMsftId(metadata.msftTaskId);
						}
					}
				}

				// 変更されたタスクを検出：位置や部分一致で判定
				const unmatchedTasks = dailyNoteTasks.filter(
					task => !this.metadataStore.hasMetadataForTask(date, task.title)
				);

				for (const unmatchedTask of unmatchedTasks) {
					// 部分一致でメタデータを探す
					const partialMatch = this.metadataStore.findByPartialTitle(date, unmatchedTask.title);
					
					if (partialMatch) {
						this.logger.info('部分一致によるタスクの変更を検出', {
							oldTitle: partialMatch.title,
							newTitle: unmatchedTask.title,
							date
						});

						// メタデータを更新
						await this.metadataStore.updateMetadataByMsftId(partialMatch.msftTaskId, {
							title: unmatchedTask.title
						});
					}
				}
			}

			this.logger.info('内部同期が完了しました');

		} catch (error) {
			const context: ErrorContext = {
				component: 'TodoSynchronizer',
				method: 'reconcileMetadataWithDailyNotes',
				timestamp: new Date().toISOString(),
				details: { error }
			};
			this.logger.error('内部同期中にエラーが発生しました', context);
			// エラーは記録するが、同期プロセス全体は継続
		}
	}

	/**
	 * 削除されたタスクの代わりに変更された可能性のあるタスクを探す
	 */
	private findPossibleTaskMatch(metadata: TaskMetadata, dailyNoteTasks: DailyNoteTask[]): DailyNoteTask | null {
		// メタデータにないタスクのみを対象
		const unmatchedTasks = dailyNoteTasks.filter(
			task => !this.metadataStore.hasMetadataForTask(metadata.date, task.title)
		);

		// 部分一致で探す
		for (const task of unmatchedTasks) {
			// 元のタイトルの一部が含まれている
			if (task.title.toLowerCase().includes(metadata.title.toLowerCase()) ||
				metadata.title.toLowerCase().includes(task.title.toLowerCase())) {
				return task;
			}

			// 共通の単語が多い
			const metadataWords = metadata.title.toLowerCase().split(/\s+/);
			const taskWords = task.title.toLowerCase().split(/\s+/);
			const commonWords = metadataWords.filter(word => taskWords.includes(word));
			
			if (commonWords.length >= Math.min(metadataWords.length, taskWords.length) * 0.5) {
				return task;
			}
		}

		return null;
	}

	/**
	 * ファイル名から日付を抽出
	 */
	private extractDateFromFilename(filename: string): string | null {
		// 一般的な日付形式にマッチ
		const datePatterns = [
			/(\d{4}-\d{2}-\d{2})/,     // YYYY-MM-DD
			/(\d{2}-\d{2}-\d{4})/,     // DD-MM-YYYY or MM-DD-YYYY
			/(\d{4}\/\d{2}\/\d{2})/,   // YYYY/MM/DD
			/(\d{2}\/\d{2}\/\d{4})/,   // DD/MM/YYYY or MM/DD/YYYY
		];

		for (const pattern of datePatterns) {
			const match = filename.match(pattern);
			if (match) {
				// 日付を YYYY-MM-DD 形式に正規化
				const datePart = match[1];
				
				// すでに YYYY-MM-DD 形式の場合
				if (/\d{4}-\d{2}-\d{2}/.test(datePart)) {
					return datePart;
				}
				
				// 他の形式から変換（簡易実装）
				// より複雑な日付解析が必要な場合は、設定に基づいて処理
				try {
					const date = new Date(datePart);
					if (!isNaN(date.getTime())) {
						return date.toISOString().split('T')[0];
					}
				} catch {
					// 解析失敗時は無視
				}
			}
		}

		return null;
	}
}