import { ErrorHandler } from '../../src/utils/ErrorHandler';
import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('ErrorHandler', () => {
	let logger: SimpleLogger;
	let errorHandler: ErrorHandler;

	beforeEach(() => {
		logger = new SimpleLogger('info');
		jest.spyOn(logger, 'error').mockImplementation();
		errorHandler = new ErrorHandler(logger);
	});

	describe('handleApiError', () => {
		it('401エラーを適切に処理', () => {
			// Arrange
			const error = {
				response: {
					status: 401,
					statusText: 'Unauthorized'
				}
			};

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe('Authentication failed. Please re-authenticate.');
			expect(logger.error).toHaveBeenCalled();
		});

		it('403エラーを適切に処理', () => {
			// Arrange
			const error = {
				response: {
					status: 403,
					statusText: 'Forbidden'
				}
			};

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe('Access denied. Check your permissions.');
		});

		it('404エラーを適切に処理', () => {
			// Arrange
			const error = {
				response: {
					status: 404,
					statusText: 'Not Found'
				}
			};

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe('Resource not found.');
		});

		it('429エラー（レート制限）を適切に処理', () => {
			// Arrange
			const error = {
				response: {
					status: 429,
					statusText: 'Too Many Requests'
				}
			};

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe('Rate limit exceeded. Please try again later.');
		});

		it('500エラーを適切に処理', () => {
			// Arrange
			const error = {
				response: {
					status: 500,
					statusText: 'Internal Server Error'
				}
			};

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe('Server error. Please try again later.');
		});

		it('未知のステータスコードを適切に処理', () => {
			// Arrange
			const error = {
				response: {
					status: 418,
					statusText: "I'm a teapot"
				}
			};

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe("API error (418): I'm a teapot");
		});

		it('メッセージのみのエラーを処理', () => {
			// Arrange
			const error = {
				message: 'Custom error message'
			};

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe('Custom error message');
		});

		it('構造化されていないエラーを処理', () => {
			// Arrange
			const error = 'Simple string error';

			// Act
			const result = errorHandler.handleApiError(error);

			// Assert
			expect(result).toBe('Unknown API error occurred');
		});

		it('nullエラーを処理', () => {
			// Act
			const result = errorHandler.handleApiError(null);

			// Assert
			expect(result).toBe('Unknown API error occurred');
		});
	});

	describe('handleNetworkError', () => {
		it('ネットワークエラーを適切に処理', () => {
			// Arrange
			const error = new Error('Network failure');

			// Act
			const result = errorHandler.handleNetworkError(error);

			// Assert
			expect(result).toBe('Network error. Please check your internet connection.');
			expect(logger.error).toHaveBeenCalledWith(
				'Network: Network error. Please check your internet connection.',
				error
			);
		});
	});

	describe('handleFileError', () => {
		it('ファイルエラーを適切に処理', () => {
			// Arrange
			const error = {
				message: 'File not found: test.md'
			};

			// Act
			const result = errorHandler.handleFileError(error);

			// Assert
			expect(result).toBe('File error: File not found: test.md');
			expect(logger.error).toHaveBeenCalledWith(
				'File: File error: File not found: test.md',
				error
			);
		});

		it('ENOENTエラーを処理', () => {
			// Arrange
			const error = {
				message: 'ENOENT: no such file or directory'
			};

			// Act
			const result = errorHandler.handleFileError(error);

			// Assert
			expect(result).toBe('File not found');
		});

		it('EACCESエラーを処理', () => {
			// Arrange
			const error = {
				message: 'EACCES: permission denied'
			};

			// Act
			const result = errorHandler.handleFileError(error);

			// Assert
			expect(result).toBe('Permission denied');
		});

		it('メッセージがないファイルエラーを処理', () => {
			// Arrange
			const error = {};

			// Act
			const result = errorHandler.handleFileError(error);

			// Assert
			expect(result).toBe('File operation failed');
		});
	});

	describe('handleAuthenticationError', () => {
		it('認証エラーを適切に処理', () => {
			// Arrange
			const error = {
				message: 'Token expired'
			};

			// Act
			const result = errorHandler.handleAuthenticationError(error);

			// Assert
			expect(result).toBe('Token expired');
			expect(logger.error).toHaveBeenCalledWith(
				'Authentication: Token expired',
				error
			);
		});

		it('Azure ADエラーを処理', () => {
			// Arrange
			const error = {
				message: 'AADSTS50126: Invalid username or password'
			};

			// Act
			const result = errorHandler.handleAuthenticationError(error);

			// Assert
			expect(result).toBe('Invalid username or password');
		});
	});

	describe('handleSyncError', () => {
		it('同期エラーを適切に処理', () => {
			// Arrange
			const error = {
				message: 'task list not found'
			};

			// Act
			const result = errorHandler.handleSyncError(error);

			// Assert
			expect(result).toBe('Task list not found. Please check your configuration.');
		});

		it('競合エラーを処理', () => {
			// Arrange
			const error = {
				message: 'conflict detected'
			};

			// Act
			const result = errorHandler.handleSyncError(error);

			// Assert
			expect(result).toBe('Sync conflict detected. Please try again.');
		});
	});

	describe('logError', () => {
		it('エラーをログに記録', () => {
			// Arrange
			const error = new Error('Test error');

			// Act
			errorHandler.logError('Test message', 'Test', error);

			// Assert
			expect(logger.error).toHaveBeenCalledWith(
				'Test: Test message',
				error
			);
		});

		it('エラーオブジェクトなしでログに記録', () => {
			// Act
			errorHandler.logError('Test message', 'Test');

			// Assert
			expect(logger.error).toHaveBeenCalledWith(
				'Test: Test message',
				undefined
			);
		});
	});
});