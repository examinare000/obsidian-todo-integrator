// Constants for ToDo Integrator Plugin
import { getAzureConfig, PLUGIN_CONFIG } from './config/AppConfig';

const azureConfig = getAzureConfig();

export const DEFAULT_SETTINGS = {
	clientId: azureConfig.CLIENT_ID,
	tenantId: azureConfig.TENANT_ID,
	todoListName: PLUGIN_CONFIG.DEFAULT_TODO_LIST_NAME,
	dailyNotesPath: PLUGIN_CONFIG.DEFAULT_DAILY_NOTES_PATH,
	autoSyncEnabled: false,
	syncIntervalMinutes: PLUGIN_CONFIG.DEFAULT_SYNC_INTERVAL_MINUTES,
	logLevel: 'info' as const,
	advancedConfigEnabled: false,
	dailyNoteDateFormat: 'YYYY-MM-DD',
	dailyNoteTemplate: undefined,
};

export const MSAL_CONFIG = {
	auth: {
		authority: 'https://login.microsoftonline.com/common',
		knownAuthorities: ['login.microsoftonline.com'],
	},
	cache: {
		cacheLocation: 'sessionStorage',
		storeAuthStateInCookie: false,
	},
};

export const GRAPH_SCOPES = [
	'https://graph.microsoft.com/Tasks.ReadWrite',
	'https://graph.microsoft.com/User.Read',
];

export const GRAPH_ENDPOINTS = {
	USER_INFO: 'https://graph.microsoft.com/v1.0/me',
	TODO_LISTS: 'https://graph.microsoft.com/v1.0/me/todo/lists',
	TASKS: (listId: string) => `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`,
	TASK: (listId: string, taskId: string) => `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${taskId}`,
};

export const UI_TEXT = {
	PLUGIN_NAME: 'ToDo Integrator',
	AUTHENTICATION: {
		TITLE: 'Microsoft Authentication',
		DEVICE_CODE_INSTRUCTION: 'Please visit the URL below and enter the device code:',
		SUCCESS: 'Authentication successful!',
		ERROR: 'Authentication failed. Please try again.',
		IN_PROGRESS: 'Authenticating...',
	},
	SYNC: {
		MANUAL_TRIGGER: 'Sync with Microsoft To Do',
		AUTO_SYNC_ENABLED: 'Auto-sync enabled',
		AUTO_SYNC_DISABLED: 'Auto-sync disabled',
		SUCCESS: 'Sync completed successfully',
		ERROR: 'Sync failed',
		IN_PROGRESS: 'Syncing...',
	},
	SETTINGS: {
		TITLE: 'ToDo Integrator Settings',
		AUTH_SECTION: 'Authentication',
		SYNC_SECTION: 'Sync Settings',
		DAILY_NOTES_SECTION: 'Daily Notes',
		ADVANCED_SECTION: 'Advanced',
	},
};

export const ERROR_CODES = {
	AUTHENTICATION_FAILED: 'AUTH_FAILED',
	TOKEN_EXPIRED: 'TOKEN_EXPIRED',
	NETWORK_ERROR: 'NETWORK_ERROR',
	API_ERROR: 'API_ERROR',
	FILE_NOT_FOUND: 'FILE_NOT_FOUND',
	PARSING_ERROR: 'PARSING_ERROR',
	DUPLICATE_TASK: 'DUPLICATE_TASK',
	INVALID_CONFIG: 'INVALID_CONFIG',
};

export const LOG_LEVELS = {
	DEBUG: 0,
	INFO: 1,
	ERROR: 2,
} as const;

export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';

export const TODO_SECTION_HEADER = '## ToDo';
export const COMPLETED_SECTION_HEADER = '## Completed';

export const TASK_REGEX = /^(\s*)-\s*\[([ x])\]\s*(.+?)(?:\s+\[todo::([a-zA-Z0-9\-]+)\])?(?:\s*✅\s*(\d{4}-\d{2}-\d{2}))?$/;
export const TODO_ID_REGEX = /\[todo::([a-zA-Z0-9\-]+)\]/;
export const COMPLETION_DATE_REGEX = /✅\s+(\d{4}-\d{2}-\d{2})/;