// Secure error handling utilities
import { Logger } from '../types';

export interface SecureErrorInfo {
	userMessage: string;
	errorCode: string;
	timestamp: string;
}

export class SecureErrorHandler {
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Handle API errors securely - logs detailed error, returns safe message to user
	 */
	handleApiError(error: unknown, operation: string): SecureErrorInfo {
		const timestamp = new Date().toISOString();
		const baseErrorCode = 'API_ERROR';
		
		// Log detailed error information for debugging
		this.logger.error(`API Error during ${operation}`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined,
			operation,
			timestamp
		});

		// Return safe, generic message to user
		return {
			userMessage: `${operation}中にエラーが発生しました。しばらく時間をおいて再試行してください。`,
			errorCode: baseErrorCode,
			timestamp
		};
	}

	/**
	 * Handle authentication errors securely
	 */
	handleAuthError(error: unknown, operation: string): SecureErrorInfo {
		const timestamp = new Date().toISOString();
		const baseErrorCode = 'AUTH_ERROR';
		
		// Log detailed error for debugging
		this.logger.error(`Authentication Error during ${operation}`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			operation,
			timestamp
		});

		// Return safe message to user
		return {
			userMessage: '認証エラーが発生しました。再度認証を行ってください。',
			errorCode: baseErrorCode,
			timestamp
		};
	}

	/**
	 * Handle file system errors securely
	 */
	handleFileError(error: unknown, operation: string, filePath?: string): SecureErrorInfo {
		const timestamp = new Date().toISOString();
		const baseErrorCode = 'FILE_ERROR';
		
		// Log detailed error including file path for debugging
		this.logger.error(`File Error during ${operation}`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			operation,
			filePath: filePath || 'unknown',
			timestamp
		});

		// Return safe message without exposing file paths
		return {
			userMessage: `ファイル操作中にエラーが発生しました。ファイルの権限とパスを確認してください。`,
			errorCode: baseErrorCode,
			timestamp
		};
	}

	/**
	 * Handle network errors securely
	 */
	handleNetworkError(error: unknown, operation: string): SecureErrorInfo {
		const timestamp = new Date().toISOString();
		const baseErrorCode = 'NETWORK_ERROR';
		
		// Log detailed error for debugging
		this.logger.error(`Network Error during ${operation}`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			operation,
			timestamp
		});

		// Return safe message to user
		return {
			userMessage: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
			errorCode: baseErrorCode,
			timestamp
		};
	}

	/**
	 * Handle validation errors securely
	 */
	handleValidationError(error: unknown, operation: string): SecureErrorInfo {
		const timestamp = new Date().toISOString();
		const baseErrorCode = 'VALIDATION_ERROR';
		
		// Log detailed error for debugging
		this.logger.error(`Validation Error during ${operation}`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			operation,
			timestamp
		});

		// Return safe message to user
		return {
			userMessage: '入力値に問題があります。設定を確認してください。',
			errorCode: baseErrorCode,
			timestamp
		};
	}

	/**
	 * Handle generic errors securely
	 */
	handleGenericError(error: unknown, operation: string): SecureErrorInfo {
		const timestamp = new Date().toISOString();
		const baseErrorCode = 'GENERIC_ERROR';
		
		// Log detailed error for debugging
		this.logger.error(`Generic Error during ${operation}`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined,
			operation,
			timestamp
		});

		// Return safe message to user
		return {
			userMessage: `${operation}中に予期しないエラーが発生しました。`,
			errorCode: baseErrorCode,
			timestamp
		};
	}

	/**
	 * Create a safe error message with masked sensitive information
	 */
	createSafeErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			// Remove sensitive information from error messages
			let safeMessage = error.message
				.replace(/Bearer [A-Za-z0-9\-._~+/]+=*/g, 'Bearer [MASKED]')
				.replace(/password[=:]\s*[^\s]+/gi, 'password=[MASKED]')
				.replace(/token[=:]\s*[^\s]+/gi, 'token=[MASKED]')
				.replace(/key[=:]\s*[^\s]+/gi, 'key=[MASKED]')
				.replace(/secret[=:]\s*[^\s]+/gi, 'secret=[MASKED]')
				.replace(/\/Users\/[^\/\s]+/g, '/Users/[MASKED]')
				.replace(/\\Users\\[^\\]+/g, '\\Users\\[MASKED]')
				.replace(/C:\\[^\\]+/g, 'C:\\[MASKED]');
			
			return safeMessage;
		}
		
		return 'Unknown error occurred';
	}
}