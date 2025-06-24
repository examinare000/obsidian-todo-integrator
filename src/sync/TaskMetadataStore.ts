import { Plugin } from 'obsidian';
import { SimpleLogger } from '../utils/simpleLogger';

interface TaskMetadata {
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
		this.metadata.set(key, {
			msftTaskId,
			date,
			title,
			lastSynced: Date.now()
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
		for (const metadata of this.metadata.values()) {
			if (metadata.msftTaskId === msftTaskId) {
				return metadata;
			}
		}
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
			const data = await this.plugin.loadData();
			if (data && data[this.storageKey]) {
				const entries = data[this.storageKey] as Array<[string, TaskMetadata]>;
				this.metadata = new Map(entries);
				this.logger.debug('Loaded task metadata', { count: this.metadata.size });
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
				pluginType: this.plugin?.constructor?.name
			});
			
			const data = await this.plugin.loadData() || {};
			data[this.storageKey] = Array.from(this.metadata.entries());
			await this.plugin.saveData(data);
			this.logger.debug('Saved task metadata', { count: this.metadata.size });
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
}