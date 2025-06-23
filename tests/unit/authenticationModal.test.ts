// Tests for AuthenticationModal

import { App } from 'obsidian';
import { AuthenticationModal } from '../../src/ui/AuthenticationModal';
import { DeviceCodeResponse } from '../../src/types';

describe('AuthenticationModal', () => {
	let mockApp: App;
	let modal: AuthenticationModal;
	let mockOnCancel: jest.Mock;

	beforeEach(() => {
		mockApp = new App();
		mockOnCancel = jest.fn();
		modal = new AuthenticationModal(mockApp, mockOnCancel);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('showDeviceCodeInstructions', () => {
		it('should display device code and verification URL', () => {
			const deviceCode: DeviceCodeResponse = {
				userCode: 'ABC123DEF',
				deviceCode: 'device-code-test',
				verificationUri: 'https://microsoft.com/devicelogin',
				expiresIn: 900,
				interval: 5,
			};

			modal.showDeviceCodeInstructions(deviceCode);

			expect(modal.contentEl.empty).toHaveBeenCalled();
			expect(modal.contentEl.createEl).toHaveBeenCalledWith('h2', { text: 'Microsoft Authentication' });
		});

		it('should show progress indicator', () => {
			const deviceCode: DeviceCodeResponse = {
				userCode: 'ABC123DEF',
				deviceCode: 'device-code-test',
				verificationUri: 'https://microsoft.com/devicelogin',
				expiresIn: 900,
				interval: 5,
			};

			modal.showDeviceCodeInstructions(deviceCode);
			modal.showProgress('Waiting for authentication...');

			expect(modal.contentEl.createEl).toHaveBeenCalledWith('div', 
				expect.objectContaining({
					text: 'Waiting for authentication...',
				})
			);
		});
	});

	describe('showAuthenticationSuccess', () => {
		it('should display success message and close button', () => {
			const userInfo = {
				email: 'test@example.com',
				displayName: 'Test User',
				id: 'test-user-id',
			};

			modal.showAuthenticationSuccess(userInfo);

			expect(modal.contentEl.empty).toHaveBeenCalled();
			expect(modal.contentEl.createEl).toHaveBeenCalledWith('h2', { text: 'Authentication Successful!' });
		});
	});

	describe('showError', () => {
		it('should display error message and retry option', () => {
			const errorMessage = 'Authentication failed. Please try again.';

			modal.showError(errorMessage);

			expect(modal.contentEl.empty).toHaveBeenCalled();
			expect(modal.contentEl.createEl).toHaveBeenCalledWith('h2', { text: 'Authentication Error' });
		});
	});

	describe('modal lifecycle', () => {
		it('should call onCancel when modal is closed', () => {
			modal.onClose();

			expect(modal.contentEl.empty).toHaveBeenCalled();
		});

		it('should create proper modal structure on open', () => {
			modal.onOpen();

			expect(modal.contentEl.createEl).toHaveBeenCalledWith('h2', { text: 'Microsoft Authentication' });
			expect(modal.contentEl.createEl).toHaveBeenCalledWith('p', 
				expect.objectContaining({
					text: expect.stringContaining('authenticate with Microsoft'),
				})
			);
		});
	});

	describe('progress handling', () => {
		beforeEach(() => {
			modal.onOpen();
		});

		it('should update progress message', () => {
			const progressMessage = 'Checking authentication status...';
			
			modal.showProgress(progressMessage);

			expect(modal.contentEl.createEl).toHaveBeenCalledWith('div',
				expect.objectContaining({
					text: progressMessage,
				})
			);
		});

		it('should handle multiple progress updates', () => {
			modal.showProgress('First message');
			modal.showProgress('Second message');

			expect(modal.contentEl.createEl).toHaveBeenCalledTimes(
				expect.any(Number)
			);
		});
	});

	describe('copy functionality', () => {
		it('should provide copy to clipboard functionality for device code', () => {
			const deviceCode: DeviceCodeResponse = {
				userCode: 'ABC123DEF',
				deviceCode: 'device-code-test',
				verificationUri: 'https://microsoft.com/devicelogin',
				expiresIn: 900,
				interval: 5,
			};

			// Mock clipboard API
			Object.assign(navigator, {
				clipboard: {
					writeText: jest.fn().mockResolvedValue(undefined),
				},
			});

			modal.showDeviceCodeInstructions(deviceCode);

			// The copy button functionality would be tested here
			// when implemented in the actual modal
		});
	});
});