// Settings Tab for ToDo Integrator Plugin

import { App, PluginSettingTab, Setting, Modal, TextComponent } from 'obsidian';
import { TodoIntegratorPlugin } from '../TodoIntegratorPlugin';
import { UI_TEXT } from '../constants';
import { PathValidator, ValidationResult } from '../utils/pathValidation';

export class TodoIntegratorSettingsTab extends PluginSettingTab {
	plugin: TodoIntegratorPlugin;
	private pathValidator: PathValidator;

	constructor(app: App, plugin: TodoIntegratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.pathValidator = new PathValidator(app);
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

		// Advanced Configuration toggle
		new Setting(containerEl)
			.setName('Advanced Configuration')
			.setDesc('独自のAzure Client IDとTenant IDを使用する場合はONにしてください')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.advancedConfigEnabled)
				.onChange(async (value) => {
					await this.plugin.updateSetting('advancedConfigEnabled', value);
					this.display(); // Refresh to show/hide advanced settings
				}));

		// Show advanced settings only if enabled
		if (this.plugin.settings.advancedConfigEnabled) {
			this.renderAdvancedClientSettings(containerEl);
		} else {
			// Information about the plugin using developer's multi-tenant client
			const infoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
			infoEl.createEl('p', { 
				text: 'このプラグインは開発者が提供するマルチテナントAzureクライアントアプリケーションを使用してMicrosoft To Doにアクセスします。認証情報はローカルに保存され、外部には送信されません。'
			});
		}

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

	private renderAdvancedClientSettings(containerEl: HTMLElement): void {
		// Security warning about using default client
		const warningEl = containerEl.createEl('div', { cls: 'setting-item-description' });
		warningEl.style.backgroundColor = '#fff3cd';
		warningEl.style.border = '1px solid #ffeaa7';
		warningEl.style.borderRadius = '4px';
		warningEl.style.padding = '10px';
		warningEl.style.marginBottom = '10px';
		warningEl.createEl('strong', { text: '⚠️ セキュリティに関する重要な注意事項' });
		warningEl.createEl('br');
		warningEl.createEl('span', { 
			text: '最高のセキュリティを確保するため、独自のAzure App Registrationの作成を強く推奨します。Advanced Configurationを有効にして独自のClient IDとTenant IDを設定してください。'
		});

		const advancedContainer = containerEl.createEl('div', { cls: 'setting-item-description' });
		
		advancedContainer.createEl('h4', { text: 'Azure App Registration設定' });
		advancedContainer.createEl('p', { 
			text: '独自のAzure App Registrationを使用する場合は、以下の手順に従ってClient IDとTenant IDを取得してください：'
		});
		
		const stepsList = advancedContainer.createEl('ol');
		stepsList.createEl('li', { text: 'Azure PortalでApp Registrationを作成' });
		stepsList.createEl('li', { text: 'Authentication設定でMobile and desktop applicationsプラットフォームを追加' });
		stepsList.createEl('li', { text: 'Redirect URIに "http://localhost" を追加' });
		stepsList.createEl('li', { text: 'API Permissionsで "Tasks.ReadWrite" と "User.Read" を追加' });
		stepsList.createEl('li', { text: 'Application (client) IDをコピーしてClient IDに入力' });
		stepsList.createEl('li', { text: 'Directory (tenant) IDをコピーしてTenant IDに入力（個人アカウントの場合は "consumers"）' });

		new Setting(containerEl)
			.setName('Client ID')
			.setDesc('Azure App Registration Client ID')
			.addText(text => text
				.setPlaceholder('Enter your Client ID')
				.setValue(this.plugin.settings.clientId)
				.onChange(async (value) => {
					await this.plugin.updateSetting('clientId', value);
				}));

		new Setting(containerEl)
			.setName('Tenant ID')
			.setDesc('Azure Tenant ID ("consumers" for personal accounts, "organizations" for work accounts)')
			.addText(text => text
				.setPlaceholder('consumers')
				.setValue(this.plugin.settings.tenantId)
				.onChange(async (value) => {
					await this.plugin.updateSetting('tenantId', value || 'consumers');
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

		// Add information about inheritance
		const infoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
		infoEl.createEl('p', { 
			text: 'Daily Notesプラグインがインストールされている場合、デフォルト値が自動的に継承されます。手動で変更すると継承を無効化し、カスタム値が優先されます。'
		});

		// Daily Notes Path setting
		const pathInheritanceStatus = this.plugin.settings._userSetDailyNotesPath ? 
			'🔧 カスタム設定' : '🔗 Daily Notesプラグインから継承';
		const pathSetting = new Setting(containerEl)
			.setName('Daily Notes Path')
			.setDesc(`Folder path where Daily Notes are stored (${pathInheritanceStatus})`)
			.addText(text => text
				.setPlaceholder('Daily Notes')
				.setValue(this.plugin.settings.dailyNotesPath)
				.onChange(async (value) => {
					const pathValue = value || 'Daily Notes';
					const validation = this.pathValidator.validateFolderPath(pathValue);
					
					if (validation.isValid) {
						await this.plugin.updateSetting('dailyNotesPath', pathValue);
						this.clearValidationMessage(pathSetting.settingEl);
						if (validation.warningMessage) {
							this.showValidationMessage(pathSetting.settingEl, validation.warningMessage, 'warning');
						}
						this.display(); // Refresh to update inheritance indicators
					} else {
						this.showValidationMessage(pathSetting.settingEl, validation.error!, 'error');
					}
				}))
			.addButton(button => button
				.setButtonText('作成')
				.setTooltip('フォルダが存在しない場合は作成します')
				.onClick(async () => {
					const pathValue = this.plugin.settings.dailyNotesPath;
					const result = await this.pathValidator.createFolderIfNeeded(pathValue);
					
					if (result.isValid) {
						this.clearValidationMessage(pathSetting.settingEl);
						if (result.warningMessage) {
							this.showValidationMessage(pathSetting.settingEl, result.warningMessage, 'success');
						}
						// Re-validate after creation
						setTimeout(() => this.display(), 100);
					} else {
						this.showValidationMessage(pathSetting.settingEl, result.error!, 'error');
					}
				}));
		
		// Initial validation for Daily Notes Path
		const initialPathValidation = this.pathValidator.validateFolderPath(this.plugin.settings.dailyNotesPath);
		if (!initialPathValidation.isValid) {
			this.showValidationMessage(pathSetting.settingEl, initialPathValidation.error!, 'error');
		}

		// Date Format setting
		const formatInheritanceStatus = this.plugin.settings._userSetDailyNoteDateFormat ? 
			'🔧 カスタム設定' : '🔗 Daily Notesプラグインから継承';
		new Setting(containerEl)
			.setName('Date Format')
			.setDesc(`Date format for Daily Note filenames (${formatInheritanceStatus})`)
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.plugin.settings.dailyNoteDateFormat)
				.onChange(async (value) => {
					await this.plugin.updateSetting('dailyNoteDateFormat', value || 'YYYY-MM-DD');
					this.display(); // Refresh to update inheritance indicators
				}));

		// Template File setting
		const templateInheritanceStatus = this.plugin.settings._userSetDailyNoteTemplate ? 
			'🔧 カスタム設定' : '🔗 Daily Notesプラグインから継承';
		let templateTextComponent: TextComponent;
		const templateSetting = new Setting(containerEl)
			.setName('Template File')
			.setDesc(`Path to template file for new Daily Notes (${templateInheritanceStatus})`)
			.addText(text => {
				templateTextComponent = text;
				return text
					.setPlaceholder('Templates/Daily Note Template.md')
					.setValue(this.plugin.settings.dailyNoteTemplate || '')
					.onChange(async (value) => {
						const validation = this.pathValidator.validateFilePath(value || '');
						
						if (validation.isValid) {
							await this.plugin.updateSetting('dailyNoteTemplate', value || undefined);
							this.clearValidationMessage(templateSetting.settingEl);
							if (validation.warningMessage) {
								this.showValidationMessage(templateSetting.settingEl, validation.warningMessage, 'warning');
							}
							this.display(); // Refresh to update inheritance indicators
						} else {
							this.showValidationMessage(templateSetting.settingEl, validation.error!, 'error');
						}
					});
			})
			.addButton(button => button
				.setButtonText('参照')
				.setTooltip('既存のMarkdownファイルを選択')
				.onClick(() => {
					this.showFileSelector(templateSetting, async (selectedPath) => {
						templateTextComponent.setValue(selectedPath);
						// Trigger validation and save
						const validation = this.pathValidator.validateFilePath(selectedPath);
						if (validation.isValid) {
							await this.plugin.updateSetting('dailyNoteTemplate', selectedPath || undefined);
							this.clearValidationMessage(templateSetting.settingEl);
							if (validation.warningMessage) {
								this.showValidationMessage(templateSetting.settingEl, validation.warningMessage, 'warning');
							}
							this.display();
						} else {
							this.showValidationMessage(templateSetting.settingEl, validation.error!, 'error');
						}
					});
				}));
		
		// Initial validation for Template File
		if (this.plugin.settings.dailyNoteTemplate) {
			const initialTemplateValidation = this.pathValidator.validateFilePath(this.plugin.settings.dailyNoteTemplate);
			if (!initialTemplateValidation.isValid) {
				this.showValidationMessage(templateSetting.settingEl, initialTemplateValidation.error!, 'error');
			} else if (initialTemplateValidation.warningMessage) {
				this.showValidationMessage(templateSetting.settingEl, initialTemplateValidation.warningMessage, 'warning');
			}
		}

		// Task Section Heading setting
		new Setting(containerEl)
			.setName('Task Section Heading')
			.setDesc('Heading name under which tasks will be managed (e.g., "# Tasks", "## ToDo")')
			.addText(text => text
				.setPlaceholder('# Tasks')
				.setValue(this.plugin.settings.taskSectionHeading)
				.onChange(async (value) => {
					await this.plugin.updateSetting('taskSectionHeading', value || '# Tasks');
				}));

		// Reset to defaults button
		new Setting(containerEl)
			.setName('Reset to Daily Notes Defaults')
			.setDesc('Clear custom settings and re-inherit from Daily Notes plugin')
			.addButton(button => button
				.setButtonText('Reset All')
				.onClick(async () => {
					// Clear user-set flags to re-enable inheritance
					this.plugin.settings._userSetDailyNotesPath = false;
					this.plugin.settings._userSetDailyNoteDateFormat = false;
					this.plugin.settings._userSetDailyNoteTemplate = false;
					
					// Re-apply Daily Notes defaults
					await this.plugin.loadSettings();
					this.display(); // Refresh the UI
				}));
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: UI_TEXT.SETTINGS.ADVANCED_SECTION });

		new Setting(containerEl)
			.setName('Log Level')
			.setDesc('Logging verbosity for debugging')
			.addDropdown(dropdown => dropdown
				.addOption('error', 'Error')
				.addOption('warn', 'Warn')
				.addOption('info', 'Info')
				.addOption('debug', 'Debug')
				.setValue(this.plugin.settings.logLevel)
				.onChange(async (value: 'debug' | 'info' | 'warn' | 'error') => {
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

	/**
	 * Show validation message below a setting
	 */
	private showValidationMessage(settingEl: HTMLElement, message: string, type: 'error' | 'warning' | 'success'): void {
		this.clearValidationMessage(settingEl);
		
		const messageEl = settingEl.createEl('div', {
			cls: `setting-validation-message setting-validation-${type}`,
			text: message
		});

		// Add appropriate styling
		messageEl.style.fontSize = '0.85em';
		messageEl.style.marginTop = '4px';
		messageEl.style.padding = '4px 8px';
		messageEl.style.borderRadius = '4px';
		
		switch (type) {
			case 'error':
				messageEl.style.color = '#e74c3c';
				messageEl.style.backgroundColor = '#fdf2f2';
				messageEl.style.border = '1px solid #fecaca';
				break;
			case 'warning':
				messageEl.style.color = '#f39c12';
				messageEl.style.backgroundColor = '#fefdf2';
				messageEl.style.border = '1px solid #fde68a';
				break;
			case 'success':
				messageEl.style.color = '#27ae60';
				messageEl.style.backgroundColor = '#f0fdf4';
				messageEl.style.border = '1px solid #bbf7d0';
				break;
		}
	}

	/**
	 * Clear any existing validation message
	 */
	private clearValidationMessage(settingEl: HTMLElement): void {
		const existingMessage = settingEl.querySelector('.setting-validation-message');
		if (existingMessage) {
			existingMessage.remove();
		}
	}

	/**
	 * Show file selector modal for template file selection
	 */
	private showFileSelector(setting: Setting, onSelect: (path: string) => void): void {
		const modal = new FileSelectionModal(this.app, this.pathValidator.getAllMarkdownFiles(), onSelect);
		modal.open();
	}
}

/**
 * Modal for selecting files from the vault
 */
class FileSelectionModal extends Modal {
	private files: string[];
	private onSelect: (path: string) => void;

	constructor(app: App, files: string[], onSelect: (path: string) => void) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'テンプレートファイルを選択' });

		if (this.files.length === 0) {
			contentEl.createEl('p', { 
				text: 'Markdownファイルが見つかりません。',
				cls: 'setting-item-description'
			});
			return;
		}

		const listEl = contentEl.createEl('div', { cls: 'file-selection-list' });
		listEl.style.maxHeight = '300px';
		listEl.style.overflowY = 'auto';
		listEl.style.border = '1px solid var(--background-modifier-border)';
		listEl.style.borderRadius = '4px';

		this.files.forEach(filePath => {
			const itemEl = listEl.createEl('div', { 
				cls: 'file-selection-item',
				text: filePath
			});
			
			itemEl.style.padding = '8px 12px';
			itemEl.style.cursor = 'pointer';
			itemEl.style.borderBottom = '1px solid var(--background-modifier-border-hover)';
			
			itemEl.addEventListener('click', () => {
				this.onSelect(filePath);
				this.close();
			});
			
			itemEl.addEventListener('mouseenter', () => {
				itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
			});
			
			itemEl.addEventListener('mouseleave', () => {
				itemEl.style.backgroundColor = '';
			});
		});

		// Add cancel button
		const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
		buttonContainer.style.marginTop = '16px';
		buttonContainer.style.textAlign = 'right';
		
		const cancelButton = buttonContainer.createEl('button', { text: 'キャンセル' });
		cancelButton.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}