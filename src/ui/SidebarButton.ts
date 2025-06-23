// Sidebar Button Component for ToDo Integrator
// Provides quick access to sync functionality and status display

import { App, setIcon } from 'obsidian';
import { SyncStatus, Logger } from '../types';
import { UI_TEXT } from '../constants';

export class SidebarButton {
	private app: App;
	private onSync: () => void;
	private logger: Logger;
	private buttonEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private currentStatus: SyncStatus = { status: 'idle' };
	private isAuthenticated: boolean = false;

	constructor(app: App, onSync: () => void, logger: Logger) {
		this.app = app;
		this.onSync = onSync;
		this.logger = logger;
	}

	createButton(containerEl: HTMLElement): HTMLElement {
		// Main button container
		this.buttonEl = containerEl.createEl('div', {
			cls: 'todo-integrator-sidebar-button',
		});

		// Sync button
		const syncButton = this.buttonEl.createEl('button', {
			cls: 'todo-integrator-sync-btn',
			title: UI_TEXT.SYNC.MANUAL_TRIGGER,
		});

		// Icon container
		const iconContainer = syncButton.createEl('span', {
			cls: 'todo-integrator-icon',
		});
		setIcon(iconContainer, 'sync');

		// Button text
		syncButton.createEl('span', {
			text: 'Sync',
			cls: 'todo-integrator-btn-text',
		});

		// Status indicator
		this.statusEl = this.buttonEl.createEl('div', {
			cls: 'todo-integrator-status',
		});

		// Click handler
		syncButton.onclick = () => this.triggerSync();

		// Initialize with current status
		this.updateDisplay();

		this.logger.debug('Sidebar button created');
		return this.buttonEl;
	}

	updateSyncStatus(status: SyncStatus): void {
		this.currentStatus = status;
		this.updateDisplay();
		this.logger.debug('Sidebar sync status updated', { status: status.status });
	}

	updateAuthenticationStatus(authenticated: boolean): void {
		this.isAuthenticated = authenticated;
		this.updateDisplay();
		this.logger.debug('Sidebar auth status updated', { authenticated });
	}

	triggerSync(): void {
		if (!this.isAuthenticated) {
			this.updateSyncStatus({
				status: 'error',
				message: 'Please authenticate first',
			});
			return;
		}

		if (this.currentStatus.status === 'syncing') {
			this.logger.debug('Sync already in progress, ignoring trigger');
			return;
		}

		this.updateSyncStatus({
			status: 'syncing',
			message: 'Starting sync...',
		});

		this.onSync();
	}

	private updateDisplay(): void {
		if (!this.buttonEl || !this.statusEl) return;

		// Update button state
		const syncButton = this.buttonEl.querySelector('.todo-integrator-sync-btn') as HTMLElement;
		if (syncButton) {
			syncButton.classList.remove('syncing', 'success', 'error', 'disabled');
			
			if (!this.isAuthenticated) {
				syncButton.classList.add('disabled');
				syncButton.title = 'Please authenticate first';
			} else {
				switch (this.currentStatus.status) {
					case 'syncing':
						syncButton.classList.add('syncing');
						syncButton.title = 'Sync in progress...';
						break;
					case 'success':
						syncButton.classList.add('success');
						syncButton.title = 'Last sync successful';
						break;
					case 'error':
						syncButton.classList.add('error');
						syncButton.title = `Sync failed: ${this.currentStatus.message || 'Unknown error'}`;
						break;
					default:
						syncButton.title = UI_TEXT.SYNC.MANUAL_TRIGGER;
				}
			}
		}

		// Update icon
		const iconContainer = this.buttonEl.querySelector('.todo-integrator-icon') as HTMLElement;
		if (iconContainer) {
			iconContainer.empty();
			
			if (!this.isAuthenticated) {
				setIcon(iconContainer, 'shield-x');
			} else {
				switch (this.currentStatus.status) {
					case 'syncing':
						setIcon(iconContainer, 'loader-2');
						iconContainer.classList.add('spinning');
						break;
					case 'success':
						setIcon(iconContainer, 'check-circle');
						iconContainer.classList.remove('spinning');
						break;
					case 'error':
						setIcon(iconContainer, 'alert-circle');
						iconContainer.classList.remove('spinning');
						break;
					default:
						setIcon(iconContainer, 'sync');
						iconContainer.classList.remove('spinning');
				}
			}
		}

		// Update status text
		this.statusEl.empty();
		
		if (!this.isAuthenticated) {
			this.statusEl.createEl('span', {
				text: '❌ Not authenticated',
				cls: 'todo-integrator-status-text error',
			});
		} else {
			let statusText = '';
			let statusClass = '';

			switch (this.currentStatus.status) {
				case 'idle':
					statusText = '⏸️ Ready to sync';
					statusClass = 'idle';
					break;
				case 'syncing':
					statusText = '🔄 Syncing...';
					statusClass = 'syncing';
					break;
				case 'success':
					statusText = '✅ Sync successful';
					statusClass = 'success';
					if (this.currentStatus.lastSync) {
						const lastSyncDate = new Date(this.currentStatus.lastSync);
						statusText += ` (${lastSyncDate.toLocaleTimeString()})`;
					}
					break;
				case 'error':
					statusText = `❌ ${this.currentStatus.message || 'Sync failed'}`;
					statusClass = 'error';
					break;
			}

			this.statusEl.createEl('span', {
				text: statusText,
				cls: `todo-integrator-status-text ${statusClass}`,
			});
		}

		// Show next sync time if available
		if (this.currentStatus.nextSync) {
			const nextSyncDate = new Date(this.currentStatus.nextSync);
			const nextSyncEl = this.statusEl.createEl('div', {
				cls: 'todo-integrator-next-sync',
			});
			nextSyncEl.createEl('span', {
				text: `Next sync: ${nextSyncDate.toLocaleTimeString()}`,
				cls: 'todo-integrator-next-sync-text',
			});
		}
	}

	destroy(): void {
		if (this.buttonEl) {
			this.buttonEl.remove();
			this.buttonEl = null;
			this.statusEl = null;
		}
		this.logger.debug('Sidebar button destroyed');
	}
}