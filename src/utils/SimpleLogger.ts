// Simple Logger Implementation for ToDo Integrator

import { Logger } from '../types';
import { LOG_LEVELS } from '../constants';

export class SimpleLogger implements Logger {
	private currentLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
	private logHistory: Array<{ level: string; message: string; timestamp: string; context?: any }> = [];
	private maxHistorySize = 100;

	constructor(level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
		this.currentLevel = level;
	}

	setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
		this.currentLevel = level;
	}

	debug(message: string, context?: any): void {
		this.log('debug', message, context);
	}

	info(message: string, context?: any): void {
		this.log('info', message, context);
	}

	warn(message: string, context?: any): void {
		this.log('warn', message, context);
	}

	error(message: string, context?: any): void {
		this.log('error', message, context);
	}

	private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any): void {
		const currentLevelValue = LOG_LEVELS[this.currentLevel.toUpperCase() as keyof typeof LOG_LEVELS];
		const messageLevelValue = LOG_LEVELS[level.toUpperCase() as keyof typeof LOG_LEVELS];

		// Only log if message level is >= current level
		if (messageLevelValue < currentLevelValue) {
			return;
		}

		const timestamp = new Date().toISOString();
		const logEntry = {
			level,
			message,
			timestamp,
			context,
		};

		// Add to history
		this.addToHistory(logEntry);

		// Format message for console
		const formattedMessage = this.formatLogMessage(level, message, timestamp);

		// Output to console based on level
		switch (level) {
			case 'debug':
				if (context) {
					console.debug(formattedMessage, context);
				} else {
					console.debug(formattedMessage);
				}
				break;
			case 'info':
				if (context) {
					console.info(formattedMessage, context);
				} else {
					console.info(formattedMessage);
				}
				break;
			case 'warn':
				if (context) {
					console.warn(formattedMessage, context);
				} else {
					console.warn(formattedMessage);
				}
				break;
			case 'error':
				if (context) {
					console.error(formattedMessage, context);
				} else {
					console.error(formattedMessage);
				}
				break;
		}
	}

	private formatLogMessage(level: string, message: string, timestamp: string): string {
		const levelUpper = level.toUpperCase().padEnd(5);
		const time = new Date(timestamp).toLocaleTimeString();
		return `[${time}] ${levelUpper} [ToDo Integrator] ${message}`;
	}

	private addToHistory(logEntry: { level: string; message: string; timestamp: string; context?: any }): void {
		// Sanitize sensitive information before storing in history
		const sanitizedEntry = {
			...logEntry,
			message: this.sanitizeSensitiveInfo(logEntry.message),
			context: logEntry.context ? this.sanitizeContext(logEntry.context) : undefined
		};
		
		this.logHistory.push(sanitizedEntry);
		
		// Keep history size manageable
		if (this.logHistory.length > this.maxHistorySize) {
			this.logHistory = this.logHistory.slice(-this.maxHistorySize);
		}
	}

	getLogHistory(): Array<{ level: string; message: string; timestamp: string; context?: any }> {
		// Return deep copy to prevent external modification
		return this.logHistory.map(entry => ({
			...entry,
			context: entry.context ? { ...entry.context } : undefined
		}));
	}

	clearHistory(): void {
		this.logHistory = [];
	}

	exportLogs(): string {
		return this.logHistory
			.map(entry => {
				const contextStr = entry.context ? ` | Context: ${JSON.stringify(entry.context)}` : '';
				return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`;
			})
			.join('\n');
	}

	/**
	 * Sanitize sensitive information from log messages
	 */
	private sanitizeSensitiveInfo(message: string): string {
		if (typeof message !== 'string') {
			return message;
		}

		return message
			// Mask Bearer tokens
			.replace(/Bearer [A-Za-z0-9\-._~+/]+=*/g, 'Bearer [MASKED]')
			// Mask passwords
			.replace(/password[=:]\s*[^\s]+/gi, 'password=[MASKED]')
			// Mask tokens
			.replace(/token[=:]\s*[^\s]+/gi, 'token=[MASKED]')
			// Mask API keys
			.replace(/key[=:]\s*[^\s]+/gi, 'key=[MASKED]')
			// Mask secrets
			.replace(/secret[=:]\s*[^\s]+/gi, 'secret=[MASKED]')
			// Mask file paths (partial)
			.replace(/\/Users\/[^\/\s]+/g, '/Users/[MASKED]')
			.replace(/\\Users\\[^\\]+/g, '\\Users\\[MASKED]')
			.replace(/C:\\[^\\]+/g, 'C:\\[MASKED]')
			// Mask email addresses partially
			.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[MASKED]@$2');
	}

	/**
	 * Sanitize sensitive information from context objects
	 */
	private sanitizeContext(context: any): any {
		if (!context || typeof context !== 'object') {
			return context;
		}

		const sanitized = { ...context };

		// Recursively sanitize object properties
		for (const key in sanitized) {
			if (sanitized.hasOwnProperty(key)) {
				const value = sanitized[key];
				
				// Sanitize known sensitive keys
				if (/token|password|secret|key|bearer|authorization/i.test(key)) {
					sanitized[key] = '[MASKED]';
				} else if (typeof value === 'string') {
					sanitized[key] = this.sanitizeSensitiveInfo(value);
				} else if (typeof value === 'object' && value !== null) {
					sanitized[key] = this.sanitizeContext(value);
				}
			}
		}

		return sanitized;
	}
}