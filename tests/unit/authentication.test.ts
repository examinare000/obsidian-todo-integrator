// Tests for MSALAuthenticationManager

import { MSALAuthenticationManager } from '../../src/authentication/MSALAuthenticationManager';
import { AuthenticationResult, DeviceCodeResponse } from '../../src/types';

// Mock MSAL Node
jest.mock('@azure/msal-node', () => ({
	PublicClientApplication: jest.fn().mockImplementation(() => ({
		acquireTokenSilent: jest.fn(),
		acquireTokenByDeviceCode: jest.fn(),
		getTokenCache: jest.fn(() => ({
			getAllAccounts: jest.fn(),
		})),
	})),
	LogLevel: {
		Error: 0,
		Warning: 1,
		Info: 2,
		Verbose: 3,
	},
}));

describe('MSALAuthenticationManager', () => {
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

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('initialize', () => {
		it('should initialize with valid client configuration', async () => {
			const clientId = 'test-client-id';
			const tenantId = 'common';

			await authManager.initialize(clientId, tenantId);

			expect(authManager.isInitialized()).toBe(true);
		});

		it('should throw error with invalid client configuration', async () => {
			await expect(authManager.initialize('', 'common')).rejects.toThrow('Invalid client configuration');
		});
	});

	describe('authenticate', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id', 'common');
		});

		it('should attempt silent authentication first', async () => {
			const mockPca = (authManager as any).pca;
			const mockMsalResult = {
				accessToken: 'test-token',
				expiresOn: new Date(Date.now() + 3600000),
				account: {
					username: 'test@example.com',
					name: 'Test User',
				},
			};

			mockPca.getTokenCache().getAllAccounts.mockReturnValue([{ username: 'test@example.com' }]);
			mockPca.acquireTokenSilent.mockResolvedValue(mockMsalResult);

			const result = await authManager.authenticate();

			expect(mockPca.acquireTokenSilent).toHaveBeenCalled();
			expect(result.accessToken).toBe('test-token');
		});

		it('should fall back to device code flow when silent auth fails', async () => {
			const mockPca = (authManager as any).pca;
			const mockDeviceCallback = jest.fn();
			const mockMsalResult = {
				accessToken: 'test-token',
				expiresOn: new Date(Date.now() + 3600000),
				account: {
					username: 'test@example.com',
					name: 'Test User',
				},
			};

			mockPca.getTokenCache().getAllAccounts.mockReturnValue([]);
			mockPca.acquireTokenSilent.mockRejectedValue(new Error('No cached token'));
			mockPca.acquireTokenByDeviceCode.mockImplementation((request: any) => {
				// Simulate device code callback
				if (request.deviceCodeCallback) {
					request.deviceCodeCallback({
						userCode: 'ABC123',
						deviceCode: 'device-code',
						verificationUri: 'https://microsoft.com/devicelogin',
						expiresIn: 900,
						interval: 5,
					});
				}
				return Promise.resolve(mockMsalResult);
			});

			const result = await authManager.authenticate(mockDeviceCallback);

			expect(mockPca.acquireTokenByDeviceCode).toHaveBeenCalled();
			expect(mockDeviceCallback).toHaveBeenCalledWith({
				userCode: 'ABC123',
				deviceCode: 'device-code',
				verificationUri: 'https://microsoft.com/devicelogin',
				expiresIn: 900,
				interval: 5,
			});
			expect(result.accessToken).toBe('test-token');
		});
	});

	describe('getAccessToken', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id', 'common');
		});

		it('should return cached token if valid', async () => {
			const mockToken = 'cached-token';
			const mockExpiry = new Date(Date.now() + 3600000);
			(authManager as any).cachedToken = mockToken;
			(authManager as any).tokenExpiry = mockExpiry;

			const token = await authManager.getAccessToken();

			expect(token).toBe(mockToken);
		});

		it('should refresh token if expired', async () => {
			const mockPca = (authManager as any).pca;
			const expiredToken = 'expired-token';
			const expiredExpiry = new Date(Date.now() - 1000);
			const newToken = 'new-token';
			const newExpiry = new Date(Date.now() + 3600000);

			(authManager as any).cachedToken = expiredToken;
			(authManager as any).tokenExpiry = expiredExpiry;

			mockPca.getTokenCache().getAllAccounts.mockReturnValue([{ username: 'test@example.com' }]);
			mockPca.acquireTokenSilent.mockResolvedValue({
				accessToken: newToken,
				expiresOn: newExpiry,
				account: { username: 'test@example.com', name: 'Test User' },
			});

			const token = await authManager.getAccessToken();

			expect(token).toBe(newToken);
			expect((authManager as any).cachedToken).toBe(newToken);
		});

		it('should throw error if no authentication available', async () => {
			await expect(authManager.getAccessToken()).rejects.toThrow('TOKEN_EXPIRED: Please re-authenticate');
		});
	});

	describe('isAuthenticated', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id', 'common');
		});

		it('should return true when valid token exists', () => {
			(authManager as any).cachedToken = 'valid-token';
			(authManager as any).tokenExpiry = new Date(Date.now() + 3600000);

			expect(authManager.isAuthenticated()).toBe(true);
		});

		it('should return false when no token exists', () => {
			expect(authManager.isAuthenticated()).toBe(false);
		});

		it('should return false when token is expired', () => {
			(authManager as any).cachedToken = 'expired-token';
			(authManager as any).tokenExpiry = new Date(Date.now() - 1000);

			expect(authManager.isAuthenticated()).toBe(false);
		});
	});

	describe('logout', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id', 'common');
		});

		it('should clear cached authentication data', async () => {
			(authManager as any).cachedToken = 'token';
			(authManager as any).tokenExpiry = new Date();

			await authManager.logout();

			expect((authManager as any).cachedToken).toBeNull();
			expect((authManager as any).tokenExpiry).toBeNull();
		});
	});
});