// Error Handler for ToDo Integrator Plugin
// Provides comprehensive error handling for API, network, and file operations

import { Logger } from '../types';

export class ErrorHandler {
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	handleApiError(error: any): string {
		let errorMessage = 'Unknown API error occurred';
		
		if (error?.response?.status) {
			switch (error.response.status) {
				case 401:
					errorMessage = 'Authentication failed. Please re-authenticate.';
					break;
				case 403:
					errorMessage = 'Access denied. Check your permissions.';
					break;
				case 404:
					errorMessage = 'Resource not found.';
					break;
				case 429:
					errorMessage = 'Rate limit exceeded. Please try again later.';
					break;
				case 500:
					errorMessage = 'Server error. Please try again later.';
					break;
				default:
					errorMessage = `API error (${error.response.status}): ${error.response.statusText}`;
			}
		} else if (error?.message) {
			errorMessage = error.message;
		}

		this.logError(errorMessage, 'API', error);
		return errorMessage;
	}

	handleNetworkError(error: any): string {
		const errorMessage = 'Network error. Please check your internet connection.';
		this.logError(errorMessage, 'Network', error);
		return errorMessage;
	}

	handleFileError(error: any): string {
		let errorMessage = 'File operation failed';
		
		if (error?.message) {
			if (error.message.includes('ENOENT')) {
				errorMessage = 'File not found';
			} else if (error.message.includes('EACCES')) {
				errorMessage = 'Permission denied';
			} else {
				errorMessage = `File error: ${error.message}`;
			}
		}

		this.logError(errorMessage, 'File', error);
		return errorMessage;
	}

	handleAuthenticationError(error: any): string {
		let errorMessage = 'Authentication failed';
		
		if (error?.message) {
			if (error.message.includes('AADSTS')) {
				// Azure AD specific errors
				if (error.message.includes('AADSTS50126')) {
					errorMessage = 'Invalid username or password';
				} else if (error.message.includes('AADSTS70002')) {
					errorMessage = 'Invalid client credentials';
				} else if (error.message.includes('AADSTS90019')) {
					errorMessage = 'Missing tenant in request';
				} else {
					errorMessage = `Azure AD error: ${error.message}`;
				}
			} else if (error.message.includes('device_code')) {
				errorMessage = 'Device code authentication failed';
			} else {
				errorMessage = error.message;
			}
		}

		this.logError(errorMessage, 'Authentication', error);
		return errorMessage;
	}

	handleSyncError(error: any): string {
		let errorMessage = 'Synchronization failed';
		
		if (error?.message) {
			if (error.message.includes('task list not found')) {
				errorMessage = 'Task list not found. Please check your configuration.';
			} else if (error.message.includes('conflict')) {
				errorMessage = 'Sync conflict detected. Please try again.';
			} else {
				errorMessage = error.message;
			}
		}

		this.logError(errorMessage, 'Sync', error);
		return errorMessage;
	}

	logError(message: string, context: string, error?: any): void {
		this.logger.error(`${context}: ${message}`, error);
	}

	logWarning(message: string, context: string, error?: any): void {
		this.logger.debug(`${context} Warning: ${message}`, error);
	}
}