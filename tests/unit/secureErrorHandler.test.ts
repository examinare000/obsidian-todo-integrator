import { SecureErrorHandler } from '../../src/utils/secureErrorHandler';
import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('SecureErrorHandler', () => {
	let logger: SimpleLogger;
	let errorHandler: SecureErrorHandler;
	let mockDate: Date;

	beforeEach(() => {
		// Mock logger
		logger = new SimpleLogger('info');
		jest.spyOn(logger, 'error').mockImplementation();
		
		// Mock Date
		mockDate = new Date('2024-01-01T12:00:00.000Z');
		jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
		
		errorHandler = new SecureErrorHandler(logger);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('handleApiError', () => {
		it('APIエラーを安全に処理', () => {
			// Arrange
			const error = new Error('Network timeout');
			const operation = 'タスク取得';

			// Act
			const result = errorHandler.handleApiError(error, operation);

			// Assert
			expect(result).toEqual({
				userMessage: 'タスク取得中にエラーが発生しました。しばらく時間をおいて再試行してください。',
				errorCode: 'API_ERROR',
				timestamp: '2024-01-01T12:00:00.000Z'
			});

			expect(logger.error).toHaveBeenCalledWith(
				'API Error during タスク取得',
				expect.objectContaining({
					error: 'Network timeout',
					stack: expect.any(String),
					operation: 'タスク取得',
					timestamp: '2024-01-01T12:00:00.000Z'
				})
			);
		});

		it('未知のエラー型を処理', () => {
			// Arrange
			const error = { code: 'UNKNOWN', message: 'Something went wrong' };
			const operation = 'データ同期';

			// Act
			const result = errorHandler.handleApiError(error, operation);

			// Assert
			expect(result.userMessage).toBe('データ同期中にエラーが発生しました。しばらく時間をおいて再試行してください。');
			expect(result.errorCode).toBe('API_ERROR');
		});

		it('機密情報を露出しない', () => {
			// Arrange
			const error = new Error('Connection to https://api.example.com/users/12345/secret-token failed');
			const operation = 'API呼び出し';

			// Act
			const result = errorHandler.handleApiError(error, operation);

			// Assert
			expect(result.userMessage).not.toContain('api.example.com');
			expect(result.userMessage).not.toContain('12345');
			expect(result.userMessage).not.toContain('secret-token');
		});
	});

	describe('handleAuthError', () => {
		it('認証エラーを安全に処理', () => {
			// Arrange
			const error = new Error('Invalid token');
			const operation = 'トークン更新';

			// Act
			const result = errorHandler.handleAuthError(error, operation);

			// Assert
			expect(result).toEqual({
				userMessage: '認証エラーが発生しました。再度認証を行ってください。',
				errorCode: 'AUTH_ERROR',
				timestamp: '2024-01-01T12:00:00.000Z'
			});

			expect(logger.error).toHaveBeenCalledWith(
				'Authentication Error during トークン更新',
				expect.objectContaining({
					error: 'Invalid token',
					operation: 'トークン更新',
					timestamp: '2024-01-01T12:00:00.000Z'
				})
			);
		});

		it('トークン情報を露出しない', () => {
			// Arrange
			const error = new Error('Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 is expired');
			const operation = '認証';

			// Act
			const result = errorHandler.handleAuthError(error, operation);

			// Assert
			expect(result.userMessage).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
		});
	});

	describe('handleFileError', () => {
		it('ファイルエラーを安全に処理', () => {
			// Arrange
			const error = new Error('ENOENT: no such file or directory');
			const operation = 'ファイル読み込み';
			const filePath = '/Users/user/secret/document.md';

			// Act
			const result = errorHandler.handleFileError(error, operation, filePath);

			// Assert
			expect(result).toEqual({
				userMessage: 'ファイル操作中にエラーが発生しました。ファイルの権限とパスを確認してください。',
				errorCode: 'FILE_ERROR',
				timestamp: '2024-01-01T12:00:00.000Z'
			});

			expect(logger.error).toHaveBeenCalledWith(
				'File Error during ファイル読み込み',
				expect.objectContaining({
					error: 'ENOENT: no such file or directory',
					operation: 'ファイル読み込み',
					filePath: '/Users/user/secret/document.md',
					timestamp: '2024-01-01T12:00:00.000Z'
				})
			);
		});

		it('ファイルパスを露出しない', () => {
			// Arrange
			const error = new Error('Cannot read /etc/passwd');
			const operation = 'ファイル操作';
			const filePath = '/etc/passwd';

			// Act
			const result = errorHandler.handleFileError(error, operation, filePath);

			// Assert
			expect(result.userMessage).not.toContain('/etc/passwd');
		});

		it('ファイルパスなしでも処理', () => {
			// Arrange
			const error = new Error('File error');
			const operation = 'ファイル処理';

			// Act
			const result = errorHandler.handleFileError(error, operation);

			// Assert
			expect(logger.error).toHaveBeenCalledWith(
				'File Error during ファイル処理',
				expect.objectContaining({
					filePath: 'unknown'
				})
			);
		});
	});

	describe('handleNetworkError', () => {
		it('ネットワークエラーを安全に処理', () => {
			// Arrange
			const error = new Error('ECONNREFUSED');
			const operation = 'API接続';

			// Act
			const result = errorHandler.handleNetworkError(error, operation);

			// Assert
			expect(result).toEqual({
				userMessage: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
				errorCode: 'NETWORK_ERROR',
				timestamp: '2024-01-01T12:00:00.000Z'
			});
		});

		it('IPアドレスやホスト名を露出しない', () => {
			// Arrange
			const error = new Error('Connection to 192.168.1.100:3000 failed');
			const operation = 'サーバー接続';

			// Act
			const result = errorHandler.handleNetworkError(error, operation);

			// Assert
			expect(result.userMessage).not.toContain('192.168.1.100');
			expect(result.userMessage).not.toContain('3000');
		});
	});

	describe('handleValidationError', () => {
		it('検証エラーを安全に処理', () => {
			// Arrange
			const error = new Error('Invalid email format');
			const operation = '入力検証';

			// Act
			const result = errorHandler.handleValidationError(error, operation);

			// Assert
			expect(result).toEqual({
				userMessage: '入力値に問題があります。設定を確認してください。',
				errorCode: 'VALIDATION_ERROR',
				timestamp: '2024-01-01T12:00:00.000Z'
			});
		});

		it('入力値を露出しない', () => {
			// Arrange
			const error = new Error('Value "user@secret-domain.com" is not allowed');
			const operation = 'メール検証';

			// Act
			const result = errorHandler.handleValidationError(error, operation);

			// Assert
			expect(result.userMessage).not.toContain('user@secret-domain.com');
		});
	});

	describe('handleGenericError', () => {
		it('汎用エラーを安全に処理', () => {
			// Arrange
			const error = new Error('Unexpected error');
			const operation = '処理';

			// Act
			const result = errorHandler.handleGenericError(error, operation);

			// Assert
			expect(result).toEqual({
				userMessage: '処理中に予期しないエラーが発生しました。',
				errorCode: 'GENERIC_ERROR',
				timestamp: '2024-01-01T12:00:00.000Z'
			});
		});

		it('スタックトレースを露出しない', () => {
			// Arrange
			const error = new Error('Stack trace with sensitive info');
			error.stack = 'at SecretClass.secretMethod (/path/to/secret/file.js:123:45)';
			const operation = '処理';

			// Act
			const result = errorHandler.handleGenericError(error, operation);

			// Assert
			expect(result.userMessage).not.toContain('SecretClass');
			expect(result.userMessage).not.toContain('secretMethod');
			expect(result.userMessage).not.toContain('/path/to/secret/file.js');
		});
	});

	describe('createSafeErrorMessage', () => {
		it('機密情報をマスク', () => {
			// Arrange
			const error = new Error('Bearer abc123xyz token is invalid');

			// Act
			const result = errorHandler.createSafeErrorMessage(error);

			// Assert
			expect(result).toBe('Bearer [MASKED] token is invalid');
		});

		it('パスワードをマスク', () => {
			// Arrange
			const error = new Error('Login failed with password=secretpass123');

			// Act
			const result = errorHandler.createSafeErrorMessage(error);

			// Assert
			expect(result).toBe('Login failed with password=[MASKED]');
		});

		it('ファイルパスをマスク', () => {
			// Arrange
			const error = new Error('Cannot read file /Users/john/Documents/secret.md');

			// Act
			const result = errorHandler.createSafeErrorMessage(error);

			// Assert
			expect(result).toBe('Cannot read file /Users/[MASKED]/Documents/secret.md');
		});

		it('Errorでない場合のデフォルトメッセージ', () => {
			// Act
			const result = errorHandler.createSafeErrorMessage('string error');

			// Assert
			expect(result).toBe('Unknown error occurred');
		});
	});
});