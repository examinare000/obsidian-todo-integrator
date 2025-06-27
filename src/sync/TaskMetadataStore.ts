import { Plugin } from 'obsidian';
import { SimpleLogger } from '../utils/simpleLogger';

export interface TaskMetadata {
	msftTaskId: string;
	date: string;
	title: string;
	lastSynced: number;
}

export class TaskMetadataStore {
	private metadata: Map<string, TaskMetadata> = new Map();
	private readonly storageKey = 'todo-integrator-task-metadata';
	private plugin: Plugin;
	private logger: SimpleLogger;

	constructor(plugin: Plugin, logger: SimpleLogger) {
		this.plugin = plugin;
		this.logger = logger;
		
		// Debug: Check if plugin has required methods
		this.logger.debug('TaskMetadataStore constructor', {
			hasPlugin: !!plugin,
			hasLoadData: typeof plugin?.loadData === 'function',
			hasSaveData: typeof plugin?.saveData === 'function',
			pluginType: plugin?.constructor?.name
		});
		
		// Load metadata asynchronously after construction
		this.loadMetadata().catch(error => {
			this.logger.error('Failed to initialize metadata store', error);
		});
	}

	/**
	 * Generate a unique key for a task based on date and title
	 */
	private generateKey(date: string, title: string): string {
		return `${date}::${title}`;
	}

	/**
	 * Store metadata for a task
	 */
	async setMetadata(date: string, title: string, msftTaskId: string): Promise<void> {
		const key = this.generateKey(date, title);
		this.logger.debug('setMetadata: Storing metadata', { 
			key, 
			date, 
			title, 
			msftTaskId,
			metadataSizeBefore: this.metadata.size
		});
		
		this.metadata.set(key, {
			msftTaskId,
			date,
			title,
			lastSynced: Date.now()
		});
		
		this.logger.debug('setMetadata: Metadata set in memory', { 
			metadataSizeAfter: this.metadata.size 
		});
		
		await this.saveMetadata();
		this.logger.debug('Task metadata stored', { key, msftTaskId });
	}

	/**
	 * Get Microsoft Todo ID for a task
	 */
	getMsftTaskId(date: string, title: string): string | undefined {
		const key = this.generateKey(date, title);
		const metadata = this.metadata.get(key);
		return metadata?.msftTaskId;
	}

	/**
	 * Get all metadata for a specific date
	 */
	getMetadataByDate(date: string): TaskMetadata[] {
		const results: TaskMetadata[] = [];
		this.metadata.forEach((metadata) => {
			if (metadata.date === date) {
				results.push(metadata);
			}
		});
		return results;
	}

	/**
	 * Find task by Microsoft Todo ID
	 */
	findByMsftTaskId(msftTaskId: string): TaskMetadata | undefined {
		this.logger.debug('findByMsftTaskId called', {
			msftTaskId,
			metadataSize: this.metadata.size,
			metadataKeys: Array.from(this.metadata.keys())
		});
		
		for (const metadata of this.metadata.values()) {
			if (metadata.msftTaskId === msftTaskId) {
				this.logger.debug('Metadata found for Microsoft task', {
					msftTaskId,
					date: metadata.date,
					title: metadata.title
				});
				return metadata;
			}
		}
		
		this.logger.debug('No metadata found for Microsoft task ID', { msftTaskId });
		return undefined;
	}

	/**
	 * Update task title (when task is renamed)
	 */
	async updateTitle(date: string, oldTitle: string, newTitle: string): Promise<void> {
		const oldKey = this.generateKey(date, oldTitle);
		const metadata = this.metadata.get(oldKey);
		
		if (metadata) {
			this.metadata.delete(oldKey);
			const newKey = this.generateKey(date, newTitle);
			this.metadata.set(newKey, {
				...metadata,
				title: newTitle,
				lastSynced: Date.now()
			});
			await this.saveMetadata();
			this.logger.debug('Task title updated in metadata', { oldTitle, newTitle, date });
		}
	}

	/**
	 * Remove metadata for a task
	 */
	async removeMetadata(date: string, title: string): Promise<void> {
		const key = this.generateKey(date, title);
		if (this.metadata.delete(key)) {
			await this.saveMetadata();
			this.logger.debug('Task metadata removed', { key });
		}
	}

	/**
	 * Clean up old metadata (older than 90 days)
	 */
	async cleanupOldMetadata(): Promise<void> {
		const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
		let removed = 0;

		this.metadata.forEach((metadata, key) => {
			if (metadata.lastSynced < ninetyDaysAgo) {
				this.metadata.delete(key);
				removed++;
			}
		});

		if (removed > 0) {
			await this.saveMetadata();
			this.logger.info('Cleaned up old metadata', { removed });
		}
	}

	/**
	 * Load metadata from storage
	 */
	private async loadMetadata(): Promise<void> {
		try {
			this.logger.debug('loadMetadata: Starting to load metadata');
			const data = await this.plugin.loadData();
			this.logger.debug('loadMetadata: Data loaded from plugin', { 
				hasData: !!data,
				dataKeys: data ? Object.keys(data) : [],
				hasStorageKey: data ? !!data[this.storageKey] : false
			});
			
			if (data && data[this.storageKey]) {
				const entries = data[this.storageKey] as Array<[string, TaskMetadata]>;
				this.metadata = new Map(entries);
				this.logger.debug('Loaded task metadata', { count: this.metadata.size });
			} else {
				this.logger.debug('No existing task metadata found, starting with empty metadata');
			}
		} catch (error) {
			this.logger.error('Failed to load task metadata', error);
		}
	}

	/**
	 * Save metadata to storage
	 */
	private async saveMetadata(): Promise<void> {
		try {
			// Debug: Check plugin state before saving
			this.logger.debug('saveMetadata called', {
				hasPlugin: !!this.plugin,
				hasLoadData: typeof this.plugin?.loadData === 'function',
				hasSaveData: typeof this.plugin?.saveData === 'function',
				pluginType: this.plugin?.constructor?.name,
				metadataSize: this.metadata.size
			});
			
			const data = await this.plugin.loadData() || {};
			this.logger.debug('saveMetadata: Current plugin data before save', {
				dataKeys: Object.keys(data),
				hasExistingMetadata: !!data[this.storageKey]
			});
			
			// Convert Map to array for storage
			const metadataArray = Array.from(this.metadata.entries());
			data[this.storageKey] = metadataArray;
			
			this.logger.debug('saveMetadata: Saving data', {
				storageKey: this.storageKey,
				metadataCount: metadataArray.length,
				dataKeysAfter: Object.keys(data)
			});
			
			await this.plugin.saveData(data);
			this.logger.debug('Saved task metadata', { count: this.metadata.size });
			
			// 保存後にデータが実際に保存されたか確認
			const verifyData = await this.plugin.loadData();
			this.logger.debug('saveMetadata: Verify after save', {
				hasStorageKey: !!verifyData[this.storageKey],
				savedMetadataCount: verifyData[this.storageKey] ? verifyData[this.storageKey].length : 0
			});
		} catch (error) {
			this.logger.error('Failed to save task metadata', error);
		}
	}

	/**
	 * Clear all metadata (for testing or reset)
	 */
	async clearAll(): Promise<void> {
		this.metadata.clear();
		await this.saveMetadata();
		this.logger.info('All task metadata cleared');
	}

	/**
	 * すべてのメタデータを取得する
	 * 内部同期で使用するため
	 */
	getAllMetadata(): TaskMetadata[] {
		return Array.from(this.metadata.values());
	}

	/**
	 * 部分的なタイトルマッチでメタデータを検索
	 * タスクタイトルが変更された場合の検出に使用
	 */
	findByPartialTitle(date: string, partialTitle: string): TaskMetadata | undefined {
		const searchTerm = partialTitle.toLowerCase();
		for (const [key, metadata] of this.metadata.entries()) {
			if (metadata.date === date && metadata.title.toLowerCase().includes(searchTerm)) {
				return metadata;
			}
		}
		return undefined;
	}

	/**
	 * Microsoft タスクIDでメタデータを削除
	 * 内部同期でタスクが削除された場合に使用
	 */
	async removeMetadataByMsftId(msftTaskId: string): Promise<boolean> {
		for (const [key, metadata] of this.metadata.entries()) {
			if (metadata.msftTaskId === msftTaskId) {
				this.metadata.delete(key);
				await this.saveMetadata();
				this.logger.debug('Metadata removed by Microsoft task ID', { msftTaskId });
				return true;
			}
		}
		return false;
	}

	/**
	 * 日付範囲でメタデータを取得
	 * 複数日にまたがる内部同期で使用
	 */
	getMetadataByDateRange(startDate: string, endDate: string): TaskMetadata[] {
		const results: TaskMetadata[] = [];
		const start = new Date(startDate).getTime();
		const end = new Date(endDate).getTime();
		
		this.metadata.forEach((metadata) => {
			const date = new Date(metadata.date).getTime();
			if (date >= start && date <= end) {
				results.push(metadata);
			}
		});
		
		return results;
	}

	/**
	 * タスクのメタデータが存在するか確認
	 * 内部同期で既存タスクの判定に使用
	 */
	hasMetadataForTask(date: string, title: string): boolean {
		const key = this.generateKey(date, title);
		return this.metadata.has(key);
	}
	
	/**
	 * メタデータを強制的に再保存する
	 * 設定の保存によってメタデータが失われた場合の対処
	 */
	async forceSaveMetadata(): Promise<void> {
		if (this.metadata.size > 0) {
			await this.saveMetadata();
			this.logger.debug('Force saved task metadata', { count: this.metadata.size });
		}
	}

	/**
	 * Microsoft タスクIDでメタデータを更新
	 * 内部同期でタイトルや日付が変更された場合に使用
	 */
	async updateMetadataByMsftId(msftTaskId: string, updates: Partial<TaskMetadata>): Promise<boolean> {
		for (const [key, metadata] of this.metadata.entries()) {
			if (metadata.msftTaskId === msftTaskId) {
				// 古いキーを削除
				this.metadata.delete(key);
				
				// 新しいメタデータを作成
				const updatedMetadata = {
					...metadata,
					...updates,
					lastSynced: Date.now()
				};
				
				// 新しいキーで保存
				const newKey = this.generateKey(
					updates.date || metadata.date,
					updates.title || metadata.title
				);
				this.metadata.set(newKey, updatedMetadata);
				
				await this.saveMetadata();
				this.logger.debug('Metadata updated by Microsoft task ID', { msftTaskId, updates });
				return true;
			}
		}
		return false;
	}
}