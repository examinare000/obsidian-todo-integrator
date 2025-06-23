// Simple Logger Implementation for ToDo Integrator

import { Logger } from '../types';
import { LOG_LEVELS } from '../constants';

export class SimpleLogger implements Logger {
	private currentLevel: 'debug' | 'info' | 'error' = 'info';
	private logHistory: Array<{ level: string; message: string; timestamp: string; context?: any }> = [];
	private maxHistorySize = 100;

	constructor(level: 'debug' | 'info' | 'error' = 'info') {
		this.currentLevel = level;
	}

	setLogLevel(level: 'debug' | 'info' | 'error'): void {
		this.currentLevel = level;
	}

	debug(message: string, context?: any): void {
		this.log('debug', message, context);
	}

	info(message: string, context?: any): void {
		this.log('info', message, context);
	}

	error(message: string, context?: any): void {
		this.log('error', message, context);
	}

	private log(level: 'debug' | 'info' | 'error', message: string, context?: any): void {
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
		this.logHistory.push(logEntry);
		
		// Keep history size manageable
		if (this.logHistory.length > this.maxHistorySize) {
			this.logHistory = this.logHistory.slice(-this.maxHistorySize);
		}
	}

	getLogHistory(): Array<{ level: string; message: string; timestamp: string; context?: any }> {
		return [...this.logHistory];
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
}