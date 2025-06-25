// Tests for SimpleLogger

import { SimpleLogger } from '../../src/utils/simpleLogger';

describe('SimpleLogger', () => {
	let logger: SimpleLogger;

	beforeEach(() => {
		logger = new SimpleLogger('info');
		// Mock console methods
		jest.spyOn(console, 'debug').mockImplementation();
		jest.spyOn(console, 'info').mockImplementation();
		jest.spyOn(console, 'warn').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('exportLogs', () => {
		it('should export empty string when no logs', () => {
			const exported = logger.exportLogs();
			expect(exported).toBe('');
		});

		it('should export logs in correct format', () => {
			logger.info('Test info message');
			logger.error('Test error message', { details: 'some error' });
			
			const exported = logger.exportLogs();
			const lines = exported.split('\n');
			
			expect(lines).toHaveLength(2);
			expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test info message$/);
			expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\] Test error message \| Context: {"details":"some error"}$/);
		});

		it('should only export logs at or above current log level', () => {
			logger.setLogLevel('warn');
			
			logger.debug('Debug message');
			logger.info('Info message');
			logger.warn('Warning message');
			logger.error('Error message');
			
			const exported = logger.exportLogs();
			const lines = exported.split('\n').filter(line => line.length > 0);
			
			expect(lines).toHaveLength(2);
			expect(lines[0]).toContain('[WARN] Warning message');
			expect(lines[1]).toContain('[ERROR] Error message');
		});

		it('should sanitize sensitive information in logs', () => {
			logger.info('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
			logger.info('password=secretPassword123');
			logger.info('User path: /Users/johndoe/Documents');
			
			const exported = logger.exportLogs();
			
			expect(exported).toContain('Bearer [MASKED]');
			expect(exported).toContain('password=[MASKED]');
			expect(exported).toContain('/Users/[MASKED]/Documents');
			expect(exported).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
			expect(exported).not.toContain('secretPassword123');
			expect(exported).not.toContain('johndoe');
		});

		it('should respect max history size', () => {
			// Max history is now 10000
			for (let i = 0; i < 10050; i++) {
				logger.info(`Message ${i}`);
			}
			
			const exported = logger.exportLogs();
			const lines = exported.split('\n').filter(line => line.length > 0);
			
			expect(lines).toHaveLength(10000);
			expect(lines[0]).toContain('Message 50'); // First 50 should be dropped
			expect(lines[9999]).toContain('Message 10049'); // Last should be 10049
		});

		it('should handle context objects correctly', () => {
			logger.info('Test with context', {
				userId: 123,
				action: 'sync',
				token: 'secret-token-123'
			});
			
			const exported = logger.exportLogs();
			
			expect(exported).toContain('"userId":123');
			expect(exported).toContain('"action":"sync"');
			expect(exported).toContain('"token":"[MASKED]"');
		});

		it('should handle batch processing efficiently', () => {
			// Test that batch processing works correctly
			for (let i = 0; i < 250; i++) {
				logger.info(`Batch test ${i}`);
			}
			
			const exported = logger.exportLogs();
			const lines = exported.split('\n').filter(line => line.length > 0);
			
			expect(lines).toHaveLength(250);
			// Verify first, middle, and last messages
			expect(lines[0]).toContain('Batch test 0');
			expect(lines[99]).toContain('Batch test 99');
			expect(lines[100]).toContain('Batch test 100');
			expect(lines[249]).toContain('Batch test 249');
		});

		it('should maintain log history after log level changes', () => {
			logger.info('Info message 1');
			logger.setLogLevel('error');
			logger.error('Error message');
			logger.info('Info message 2'); // Won't be logged due to level
			logger.setLogLevel('info');
			logger.info('Info message 3');
			
			const exported = logger.exportLogs();
			const lines = exported.split('\n').filter(line => line.length > 0);
			
			expect(lines).toHaveLength(3);
			expect(lines[0]).toContain('Info message 1');
			expect(lines[1]).toContain('Error message');
			expect(lines[2]).toContain('Info message 3');
		});
	});

	describe('clearHistory', () => {
		it('should clear all log history', () => {
			logger.info('Message 1');
			logger.error('Message 2');
			
			expect(logger.exportLogs()).not.toBe('');
			
			logger.clearHistory();
			
			expect(logger.exportLogs()).toBe('');
		});
	});

	describe('getLogHistory', () => {
		it('should return copy of log history', () => {
			logger.info('Test message', { data: 'test' });
			
			const history = logger.getLogHistory();
			
			expect(history).toHaveLength(1);
			expect(history[0]).toMatchObject({
				level: 'info',
				message: 'Test message',
				context: { data: 'test' }
			});
			
			// Modifying returned history should not affect internal history
			history[0].message = 'Modified';
			const newHistory = logger.getLogHistory();
			expect(newHistory[0].message).toBe('Test message');
		});
	});
});