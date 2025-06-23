// Tests for SidebarButton UI Component

import { App } from 'obsidian';
import { SidebarButton } from '../../src/ui/SidebarButton';
import { SyncStatus } from '../../src/types';

describe('SidebarButton', () => {
	let sidebarButton: SidebarButton;
	let mockApp: App;
	let mockOnSync: jest.Mock;
	let mockLogger: any;

	beforeEach(() => {
		mockApp = new App();
		mockOnSync = jest.fn();
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};
		
		sidebarButton = new SidebarButton(mockApp, mockOnSync, mockLogger);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	test('should create sidebar button instance', () => {
		expect(sidebarButton).toBeDefined();
	});

	test('should update sync status to syncing', () => {
		const status: SyncStatus = {
			status: 'syncing',
			message: 'Synchronizing...',
		};

		sidebarButton.updateSyncStatus(status);

		expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar sync status updated', { status: 'syncing' });
	});

	test('should update sync status to success', () => {
		const status: SyncStatus = {
			status: 'success',
			message: 'Sync completed successfully',
			lastSync: '2024-01-15T10:00:00Z',
		};

		sidebarButton.updateSyncStatus(status);

		expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar sync status updated', { status: 'success' });
	});

	test('should update sync status to error', () => {
		const status: SyncStatus = {
			status: 'error',
			message: 'Sync failed',
		};

		sidebarButton.updateSyncStatus(status);

		expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar sync status updated', { status: 'error' });
	});

	test('should trigger sync callback when authenticated', () => {
		// Set authentication status first
		sidebarButton.updateAuthenticationStatus(true);
		
		sidebarButton.triggerSync();

		expect(mockOnSync).toHaveBeenCalled();
	});

	test('should not trigger sync when not authenticated', () => {
		// Ensure not authenticated
		sidebarButton.updateAuthenticationStatus(false);
		
		sidebarButton.triggerSync();

		expect(mockOnSync).not.toHaveBeenCalled();
	});

	test('should handle authentication status updates', () => {
		sidebarButton.updateAuthenticationStatus(true);
		expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar auth status updated', { authenticated: true });

		sidebarButton.updateAuthenticationStatus(false);
		expect(mockLogger.debug).toHaveBeenCalledWith('Sidebar auth status updated', { authenticated: false });
	});
});