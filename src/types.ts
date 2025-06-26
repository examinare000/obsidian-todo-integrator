// TypeScript type definitions for ToDo Integrator Plugin

export interface TodoIntegratorSettings {
	clientId: string;
	tenantId: string;
	todoListName: string;
	dailyNotesPath: string;
	autoSyncEnabled: boolean;
	syncIntervalMinutes: number;
	logLevel: 'debug' | 'info' | 'warn' | 'error';
	lastSyncTime?: string;
	advancedConfigEnabled: boolean;
	dailyNoteDateFormat: string;
	dailyNoteTemplate?: string;
	taskSectionHeading: string;
	// Inheritance flags to track if user has manually set these values
	_userSetDailyNotesPath?: boolean;
	_userSetDailyNoteDateFormat?: boolean;
	_userSetDailyNoteTemplate?: boolean;
}

export interface AuthenticationResult {
	accessToken: string;
	expiresOn: Date;
	account: {
		username: string;
		name: string;
	};
}

export interface DeviceCodeResponse {
	userCode: string;
	deviceCode: string;
	verificationUri: string;
	expiresIn: number;
	interval: number;
}

export interface TodoTask {
	id: string;
	title: string;
	status: 'notStarted' | 'inProgress' | 'completed';
	createdDateTime: string;
	completedDateTime?: string;
	dueDateTime?: {
		dateTime: string;
		timeZone: string;
	};
	startDateTime?: {
		dateTime: string;
		timeZone: string;
	};
	body?: {
		content: string;
		contentType: string;
	};
}

export interface TodoList {
	id: string;
	displayName: string;
	isOwner: boolean;
	isShared: boolean;
	wellknownListName?: string;
}

export interface ObsidianTask {
	file: string;
	line: number;
	text: string;
	completed: boolean;
	completionDate?: string;
	dueDate?: string;
	microsoftTodoId?: string;
	indent?: string;
}

export interface DailyNoteTask {
	title: string;
	completed: boolean;
	lineNumber: number;
	completionDate?: string;
	startDate?: string;
	filePath?: string;
}

export interface SyncResult {
	msftToObsidian: {
		added: number;
		errors: string[];
	};
	obsidianToMsft: {
		added: number;
		errors: string[];
	};
	completions: {
		completed: number;
		errors: string[];
	};
	timestamp: string;
	// 後方互換性のための集計フィールド
	added?: number;  // 総追加数
	completed?: number;  // 総完了数
	errors?: string[];  // 全エラー
}

export interface TaskPair {
	obsidianTask: DailyNoteTask;
	msftTask: TodoTask;
	confidence: number;
}

export interface UserInfo {
	email: string;
	displayName: string;
	id: string;
}

export interface Logger {
	debug(message: string, context?: any): void;
	info(message: string, context?: any): void;
	warn(message: string, context?: any): void;
	error(message: string, context?: any): void;
	setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void;
	exportLogs(): string;
}

export interface ErrorContext {
	component: string;
	method: string;
	timestamp: string;
	details?: any;
}

export type TokenProvider = () => Promise<string>;

export interface ApiResponse<T> {
	value?: T[];
	data?: T;
	error?: {
		code: string;
		message: string;
	};
}

export interface GraphApiError {
	error: {
		code: string;
		message: string;
		innerError?: {
			code: string;
			message: string;
		};
	};
}

export interface SyncStatus {
	status: 'idle' | 'syncing' | 'success' | 'error';
	message?: string;
	lastSync?: string;
	nextSync?: string;
}