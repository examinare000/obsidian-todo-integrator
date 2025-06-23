// Microsoft Authentication Library (MSAL) Authentication Manager
// Implements Device Code Flow for Obsidian plugin authentication

import { 
	PublicClientApplication, 
	Configuration, 
	DeviceCodeRequest,
	SilentFlowRequest,
	AuthenticationResult as MSALAuthResult,
	LogLevel,
	AccountInfo,
} from '@azure/msal-node';

import { 
	AuthenticationResult, 
	DeviceCodeResponse, 
	Logger, 
	ErrorContext 
} from '../types';
import { MSAL_CONFIG, GRAPH_SCOPES, ERROR_CODES } from '../constants';

export class MSALAuthenticationManager {
	private pca: PublicClientApplication | null = null;
	private logger: Logger;
	private cachedToken: string | null = null;
	private tokenExpiry: Date | null = null;
	private currentAccount: AccountInfo | null = null;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	async initialize(clientId: string, tenantId: string): Promise<void> {
		if (!clientId || !tenantId) {
			throw new Error('Invalid client configuration: clientId and tenantId are required');
		}

		const config: Configuration = {
			auth: {
				clientId,
				authority: `https://login.microsoftonline.com/${tenantId}`,
				knownAuthorities: ['login.microsoftonline.com'],
			},
			cache: MSAL_CONFIG.cache,
			system: {
				loggerOptions: {
					loggerCallback: (level, message, containsPii) => {
						if (!containsPii) {
							switch (level) {
								case LogLevel.Error:
									this.logger.error(`MSAL: ${message}`);
									break;
								case LogLevel.Warning:
									this.logger.debug(`MSAL Warning: ${message}`);
									break;
								case LogLevel.Info:
									this.logger.debug(`MSAL Info: ${message}`);
									break;
								case LogLevel.Verbose:
									this.logger.debug(`MSAL Verbose: ${message}`);
									break;
							}
						}
					},
					piiLoggingEnabled: false,
					logLevel: LogLevel.Warning,
				},
			},
		};

		try {
			this.pca = new PublicClientApplication(config);
			this.logger.info('MSAL authentication manager initialized', { clientId, tenantId });
		} catch (error) {
			const context: ErrorContext = {
				component: 'MSALAuthenticationManager',
				method: 'initialize',
				timestamp: new Date().toISOString(),
				details: { clientId, tenantId, error },
			};
			this.logger.error('Failed to initialize MSAL', context);
			throw error;
		}
	}

	async authenticate(deviceCodeCallback?: (response: DeviceCodeResponse) => void): Promise<AuthenticationResult> {
		if (!this.pca) {
			throw new Error('Authentication manager not initialized');
		}

		try {
			// First attempt: Silent authentication
			const silentResult = await this.attemptSilentAuth();
			if (silentResult) {
				this.logger.info('Silent authentication successful');
				return silentResult;
			}

			// Second attempt: Device code flow
			this.logger.info('Attempting device code authentication');
			return await this.initiateDeviceCodeFlow(deviceCodeCallback);

		} catch (error) {
			const context: ErrorContext = {
				component: 'MSALAuthenticationManager',
				method: 'authenticate',
				timestamp: new Date().toISOString(),
				details: { error },
			};
			this.logger.error('Authentication failed', context);
			throw new Error(`${ERROR_CODES.AUTHENTICATION_FAILED}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	private async attemptSilentAuth(): Promise<AuthenticationResult | null> {
		if (!this.pca) return null;

		try {
			const accounts = this.pca.getTokenCache().getAllAccounts();
			if (accounts.length === 0) {
				this.logger.debug('No cached accounts found');
				return null;
			}

			const account = accounts[0];
			const silentRequest: SilentFlowRequest = {
				account,
				scopes: GRAPH_SCOPES,
			};

			const result = await this.pca.acquireTokenSilent(silentRequest);
			return this.processAuthResult(result);

		} catch (error) {
			this.logger.debug('Silent authentication failed', { error });
			return null;
		}
	}

	private async initiateDeviceCodeFlow(deviceCodeCallback?: (response: DeviceCodeResponse) => void): Promise<AuthenticationResult> {
		if (!this.pca) {
			throw new Error('MSAL not initialized');
		}

		const deviceCodeRequest: DeviceCodeRequest = {
			scopes: GRAPH_SCOPES,
			deviceCodeCallback: (response) => {
				const deviceCodeResponse: DeviceCodeResponse = {
					userCode: response.userCode,
					deviceCode: response.deviceCode,
					verificationUri: response.verificationUri,
					expiresIn: response.expiresIn,
					interval: response.interval,
				};

				this.logger.info('Device code received', {
					userCode: response.userCode,
					verificationUri: response.verificationUri,
				});

				if (deviceCodeCallback) {
					deviceCodeCallback(deviceCodeResponse);
				}
			},
		};

		const result = await this.pca.acquireTokenByDeviceCode(deviceCodeRequest);
		return this.processAuthResult(result);
	}

	private processAuthResult(msalResult: MSALAuthResult): AuthenticationResult {
		this.cachedToken = msalResult.accessToken;
		this.tokenExpiry = msalResult.expiresOn || new Date(Date.now() + 3600000); // Default 1 hour
		this.currentAccount = msalResult.account;

		const result: AuthenticationResult = {
			accessToken: msalResult.accessToken,
			expiresOn: this.tokenExpiry,
			account: {
				username: msalResult.account?.username || '',
				name: msalResult.account?.name || '',
			},
		};

		this.logger.info('Authentication successful', {
			username: result.account.username,
			expiresOn: result.expiresOn,
		});

		return result;
	}

	async getAccessToken(): Promise<string> {
		if (!this.cachedToken || !this.tokenExpiry) {
			throw new Error('No authentication available. Please authenticate first.');
		}

		// Check if token is still valid (with 5-minute buffer)
		const bufferTime = 5 * 60 * 1000; // 5 minutes
		if (this.tokenExpiry.getTime() - bufferTime > Date.now()) {
			return this.cachedToken;
		}

		// Token expired, attempt refresh
		this.logger.info('Access token expired, attempting refresh');
		try {
			const refreshedAuth = await this.attemptSilentAuth();
			if (refreshedAuth) {
				return refreshedAuth.accessToken;
			}
		} catch (error) {
			this.logger.error('Token refresh failed', { error });
		}

		throw new Error(`${ERROR_CODES.TOKEN_EXPIRED}: Please re-authenticate`);
	}

	isAuthenticated(): boolean {
		if (!this.cachedToken || !this.tokenExpiry) {
			return false;
		}

		return this.tokenExpiry.getTime() > Date.now();
	}

	isInitialized(): boolean {
		return this.pca !== null;
	}

	async logout(): Promise<void> {
		this.cachedToken = null;
		this.tokenExpiry = null;
		this.currentAccount = null;

		if (this.pca) {
			try {
				const accounts = this.pca.getTokenCache().getAllAccounts();
				for (const account of accounts) {
					await this.pca.getTokenCache().removeAccount(account);
				}
				this.logger.info('Logout successful');
			} catch (error) {
				this.logger.error('Error during logout', { error });
			}
		}
	}

	getCurrentAccount(): AccountInfo | null {
		return this.currentAccount;
	}
}