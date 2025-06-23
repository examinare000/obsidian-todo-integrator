// Simplified tests for authentication functionality

import { MSALAuthenticationManager } from '../../src/authentication/MSALAuthenticationManager';

// Mock MSAL Node
jest.mock('@azure/msal-node');

describe('MSALAuthenticationManager - Basic Functionality', () => {
	let authManager: MSALAuthenticationManager;
	let mockLogger: any;

	beforeEach(() => {
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};
		authManager = new MSALAuthenticationManager(mockLogger);
	});

	test('should initialize without errors', () => {
		expect(authManager).toBeDefined();
		expect(authManager.isInitialized()).toBe(false);
	});

	test('should not be authenticated initially', () => {
		expect(authManager.isAuthenticated()).toBe(false);
	});

	test('should require initialization before authentication', async () => {
		await expect(authManager.authenticate()).rejects.toThrow('Authentication manager not initialized');
	});

	test('should require authentication before getting access token', async () => {
		await expect(authManager.getAccessToken()).rejects.toThrow('No authentication available');
	});

	test('should validate client configuration during initialization', async () => {
		await expect(authManager.initialize('', 'common')).rejects.toThrow('Invalid client configuration');
		await expect(authManager.initialize('client-id', '')).rejects.toThrow('Invalid client configuration');
	});
});