// Settings Tab for ToDo Integrator Plugin

import { App, PluginSettingTab, Setting } from 'obsidian';
import { TodoIntegratorPlugin } from '../TodoIntegratorPlugin';
import { UI_TEXT } from '../constants';

export class TodoIntegratorSettingsTab extends PluginSettingTab {
	plugin: TodoIntegratorPlugin;

	constructor(app: App, plugin: TodoIntegratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: UI_TEXT.SETTINGS.TITLE });

		// Authentication Section
		this.renderAuthenticationSection(containerEl);

		// Sync Settings Section
		this.renderSyncSettingsSection(containerEl);

		// Daily Notes Section
		this.renderDailyNotesSection(containerEl);

		// Advanced Section
		this.renderAdvancedSection(containerEl);

		// Status Section
		this.renderStatusSection(containerEl);
	}

	private renderAuthenticationSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: UI_TEXT.SETTINGS.AUTH_SECTION });

		new Setting(containerEl)
			.setName('Client ID')
			.setDesc('Azure App Registration Client ID for Microsoft authentication')
			.addText(text => text
				.setPlaceholder('Enter your Client ID')
				.setValue(this.plugin.settings.clientId)
				.onChange(async (value) => {
					await this.plugin.updateSetting('clientId', value);
				}));

		new Setting(containerEl)
			.setName('Tenant ID')
			.setDesc('Azure Tenant ID (use "common" for personal Microsoft accounts)')
			.addText(text => text
				.setPlaceholder('common')
				.setValue(this.plugin.settings.tenantId)
				.onChange(async (value) => {
					await this.plugin.updateSetting('tenantId', value || 'common');
				}));

		// Authentication status and actions
		const authStatus = this.plugin.getAuthenticationStatus();
		
		new Setting(containerEl)
			.setName('Authentication Status')
			.setDesc(authStatus.isAuthenticated ? '✅ Authenticated' : '❌ Not authenticated')
			.addButton(button => button
				.setButtonText(authStatus.isAuthenticated ? 'Logout' : 'Authenticate')
				.onClick(async () => {
					if (authStatus.isAuthenticated) {
						await this.plugin.logout();
					} else {
						await this.plugin.authenticateWithMicrosoft();
					}
					this.display(); // Refresh the settings display
				}));
	}

	private renderSyncSettingsSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: UI_TEXT.SETTINGS.SYNC_SECTION });

		new Setting(containerEl)
			.setName('Task List Name')
			.setDesc('Name of the Microsoft To Do list to sync with')
			.addText(text => text
				.setPlaceholder('Obsidian Tasks')
				.setValue(this.plugin.settings.todoListName)
				.onChange(async (value) => {
					await this.plugin.updateSetting('todoListName', value || 'Obsidian Tasks');
				}));

		new Setting(containerEl)
			.setName('Auto-sync')
			.setDesc('Automatically sync tasks at regular intervals')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncEnabled)
				.onChange(async (value) => {
					await this.plugin.updateSetting('autoSyncEnabled', value);
				}));

		new Setting(containerEl)
			.setName('Sync Interval')
			.setDesc('How often to sync automatically (in minutes)')
			.addSlider(slider => slider
				.setLimits(5, 60, 5)
				.setValue(this.plugin.settings.syncIntervalMinutes)
				.setDynamicTooltip()
				.onChange(async (value) => {
					await this.plugin.updateSetting('syncIntervalMinutes', value);
				}));

		// Manual sync button
		new Setting(containerEl)
			.setName('Manual Sync')
			.setDesc('Trigger an immediate sync')
			.addButton(button => button
				.setButtonText('Sync Now')
				.setCta()
				.onClick(() => {
					this.plugin.performManualSync();
				}));
	}

	private renderDailyNotesSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: UI_TEXT.SETTINGS.DAILY_NOTES_SECTION });

		new Setting(containerEl)
			.setName('Daily Notes Path')
			.setDesc('Folder path where Daily Notes are stored')
			.addText(text => text
				.setPlaceholder('Daily Notes')
				.setValue(this.plugin.settings.dailyNotesPath)
				.onChange(async (value) => {
					await this.plugin.updateSetting('dailyNotesPath', value || 'Daily Notes');
				}));
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: UI_TEXT.SETTINGS.ADVANCED_SECTION });

		new Setting(containerEl)
			.setName('Log Level')
			.setDesc('Logging verbosity for debugging')
			.addDropdown(dropdown => dropdown
				.addOption('error', 'Error')
				.addOption('info', 'Info')
				.addOption('debug', 'Debug')
				.setValue(this.plugin.settings.logLevel)
				.onChange(async (value: 'debug' | 'info' | 'error') => {
					await this.plugin.updateSetting('logLevel', value);
				}));

		// Export logs button
		new Setting(containerEl)
			.setName('Export Logs')
			.setDesc('Download plugin logs for debugging')
			.addButton(button => button
				.setButtonText('Export Logs')
				.onClick(() => {
					this.exportLogs();
				}));
	}

	private renderStatusSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Status' });

		const statusEl = containerEl.createEl('div', { cls: 'todo-integrator-status' });

		// Last sync time
		if (this.plugin.settings.lastSyncTime) {
			const lastSync = new Date(this.plugin.settings.lastSyncTime);
			statusEl.createEl('p', {
				text: `Last sync: ${lastSync.toLocaleString()}`,
			});
		} else {
			statusEl.createEl('p', {
				text: 'No sync performed yet',
			});
		}

		// Plugin version
		statusEl.createEl('p', {
			text: `Plugin version: ${this.plugin.manifest.version}`,
		});

		// Authentication status
		const authStatus = this.plugin.getAuthenticationStatus();
		statusEl.createEl('p', {
			text: `Authentication: ${authStatus.isAuthenticated ? 'Connected' : 'Not connected'}`,
		});

		// Auto-sync status
		statusEl.createEl('p', {
			text: `Auto-sync: ${this.plugin.settings.autoSyncEnabled ? 'Enabled' : 'Disabled'}`,
		});
	}

	private exportLogs(): void {
		try {
			// Export logs functionality - SimpleLogger doesn't have exportLogs method
			const logs = 'Log export feature not implemented in SimpleLogger';
			const blob = new Blob([logs], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			
			const a = document.createElement('a');
			a.href = url;
			a.download = `todo-integrator-logs-${new Date().toISOString().slice(0, 10)}.txt`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

		} catch (error) {
			console.error('Failed to export logs:', error);
		}
	}
}