// Authentication Modal for Device Code Flow
// Provides user-friendly authentication experience

import { App, Modal } from 'obsidian';
import { DeviceCodeResponse, UserInfo } from '../types';
import { UI_TEXT } from '../constants';

export class AuthenticationModal extends Modal {
	private onCancel: () => void;
	private progressContainer: HTMLElement | null = null;
	private currentDeviceCode: DeviceCodeResponse | null = null;

	constructor(app: App, onCancel: () => void) {
		super(app);
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.renderInitialView();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		// Clean up any timers or resources
		if (this.currentDeviceCode) {
			this.currentDeviceCode = null;
		}
	}

	private renderInitialView(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: UI_TEXT.AUTHENTICATION.TITLE });
		
		contentEl.createEl('p', { 
			text: 'To sync with Microsoft To Do, you need to authenticate with Microsoft. This process uses a secure device code flow.' 
		});

		const buttonContainer = contentEl.createEl('div', { cls: 'todo-integrator-button-container' });
		
		const startButton = buttonContainer.createEl('button', { 
			text: 'Start Authentication',
			cls: 'mod-cta'
		});
		startButton.onclick = () => this.startAuthentication();

		const cancelButton = buttonContainer.createEl('button', { 
			text: 'Cancel',
			cls: 'mod-cancel'
		});
		cancelButton.onclick = () => this.close();
	}

	private startAuthentication(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: UI_TEXT.AUTHENTICATION.TITLE });
		contentEl.createEl('p', { text: UI_TEXT.AUTHENTICATION.IN_PROGRESS });

		this.progressContainer = contentEl.createEl('div', { cls: 'todo-integrator-progress' });
		this.showProgress('Initializing authentication...');
	}

	showDeviceCodeInstructions(deviceCode: DeviceCodeResponse): void {
		this.currentDeviceCode = deviceCode;
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: UI_TEXT.AUTHENTICATION.TITLE });
		
		const instructionEl = contentEl.createEl('div', { cls: 'todo-integrator-device-code' });
		
		instructionEl.createEl('p', { 
			text: UI_TEXT.AUTHENTICATION.DEVICE_CODE_INSTRUCTION 
		});

		// Verification URL section
		const urlContainer = instructionEl.createEl('div', { cls: 'todo-integrator-url-container' });
		urlContainer.createEl('label', { text: 'URL:' });
		const urlEl = urlContainer.createEl('code', { 
			text: deviceCode.verificationUri,
			cls: 'todo-integrator-code'
		});
		
		const copyUrlButton = urlContainer.createEl('button', { 
			text: 'Copy URL',
			cls: 'mod-small'
		});
		copyUrlButton.onclick = () => this.copyToClipboard(deviceCode.verificationUri, 'URL copied!');

		// Device code section
		const codeContainer = instructionEl.createEl('div', { cls: 'todo-integrator-code-container' });
		codeContainer.createEl('label', { text: 'Device Code:' });
		const codeEl = codeContainer.createEl('code', { 
			text: deviceCode.userCode,
			cls: 'todo-integrator-code todo-integrator-device-code-text'
		});
		
		const copyCodeButton = codeContainer.createEl('button', { 
			text: 'Copy Code',
			cls: 'mod-small'
		});
		copyCodeButton.onclick = () => this.copyToClipboard(deviceCode.userCode, 'Code copied!');

		// Instructions
		const stepsEl = instructionEl.createEl('ol', { cls: 'todo-integrator-steps' });
		stepsEl.createEl('li', { text: 'Click "Copy URL" and open the link in your web browser' });
		stepsEl.createEl('li', { text: 'Click "Copy Code" and paste the device code when prompted' });
		stepsEl.createEl('li', { text: 'Complete the authentication in your browser' });
		stepsEl.createEl('li', { text: 'Return to Obsidian - this dialog will close automatically' });

		// Progress section
		this.progressContainer = contentEl.createEl('div', { cls: 'todo-integrator-progress' });
		this.showProgress('Waiting for authentication...');

		// Expiry timer
		this.startExpiryTimer(deviceCode.expiresIn);

		// Cancel button
		const buttonContainer = contentEl.createEl('div', { cls: 'todo-integrator-button-container' });
		const cancelButton = buttonContainer.createEl('button', { 
			text: 'Cancel',
			cls: 'mod-cancel'
		});
		cancelButton.onclick = () => {
			this.onCancel();
			this.close();
		};
	}

	showProgress(message: string): void {
		if (!this.progressContainer) return;

		this.progressContainer.empty();
		
		const progressEl = this.progressContainer.createEl('div', { cls: 'todo-integrator-progress-item' });
		progressEl.createEl('span', { text: '⏳ ' });
		progressEl.createEl('span', { text: message });
	}

	showAuthenticationSuccess(userInfo: UserInfo): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Authentication Successful!' });
		
		const successEl = contentEl.createEl('div', { cls: 'todo-integrator-success' });
		successEl.createEl('p', { text: '✅ You have successfully authenticated with Microsoft.' });
		
		const userInfoEl = successEl.createEl('div', { cls: 'todo-integrator-user-info' });
		userInfoEl.createEl('p', { text: `Welcome, ${userInfo.displayName}!` });
		userInfoEl.createEl('p', { text: `Account: ${userInfo.email}` });

		const buttonContainer = contentEl.createEl('div', { cls: 'todo-integrator-button-container' });
		const closeButton = buttonContainer.createEl('button', { 
			text: 'Continue',
			cls: 'mod-cta'
		});
		closeButton.onclick = () => this.close();

		// Auto-close after 3 seconds
		setTimeout(() => {
			if (this.isOpen) {
				this.close();
			}
		}, 3000);
	}

	showError(message: string): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Authentication Error' });
		
		const errorEl = contentEl.createEl('div', { cls: 'todo-integrator-error' });
		errorEl.createEl('p', { text: '❌ ' + message });

		const buttonContainer = contentEl.createEl('div', { cls: 'todo-integrator-button-container' });
		
		const retryButton = buttonContainer.createEl('button', { 
			text: 'Try Again',
			cls: 'mod-cta'
		});
		retryButton.onclick = () => this.renderInitialView();

		const cancelButton = buttonContainer.createEl('button', { 
			text: 'Cancel',
			cls: 'mod-cancel'
		});
		cancelButton.onclick = () => this.close();
	}

	private async copyToClipboard(text: string, successMessage: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			
			// Show temporary success feedback
			const feedback = document.createElement('span');
			feedback.textContent = successMessage;
			feedback.style.color = 'var(--text-success)';
			feedback.style.marginLeft = '8px';
			feedback.style.fontSize = '0.9em';
			
			// Find the button that was clicked and add feedback
			const event = window.event;
			if (event && event.target instanceof HTMLElement) {
				const button = event.target;
				button.parentElement?.appendChild(feedback);
				
				setTimeout(() => {
					feedback.remove();
				}, 2000);
			}
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
		}
	}

	private startExpiryTimer(expiresIn: number): void {
		const expiryTime = Date.now() + (expiresIn * 1000);
		
		const updateTimer = () => {
			const remainingMs = expiryTime - Date.now();
			if (remainingMs <= 0) {
				this.showError('Authentication code has expired. Please try again.');
				return;
			}

			const remainingMinutes = Math.ceil(remainingMs / 60000);
			const timerText = `Code expires in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
			
			// Update the progress section with timer
			if (this.progressContainer) {
				const timerEl = this.progressContainer.querySelector('.todo-integrator-timer');
				if (timerEl) {
					timerEl.textContent = timerText;
				} else {
					const newTimerEl = this.progressContainer.createEl('div', { 
						text: timerText,
						cls: 'todo-integrator-timer'
					});
				}
			}

			// Continue timer if modal is still open
			if (this.isOpen && remainingMs > 0) {
				setTimeout(updateTimer, 30000); // Update every 30 seconds
			}
		};

		// Start the timer
		setTimeout(updateTimer, 1000);
	}

	private get isOpen(): boolean {
		return this.containerEl.isConnected;
	}
}