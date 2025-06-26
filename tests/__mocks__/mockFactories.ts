/**
 * テスト用モックファクトリー
 * 各テストで共通して使用されるモックオブジェクトを生成する
 */

import { Plugin } from 'obsidian';
import { SimpleLogger } from '../../src/utils/simpleLogger';
import { TodoApiClient } from '../../src/api/TodoApiClient';
import { DailyNoteManager } from '../../src/sync/DailyNoteManager';
import { TaskMetadataStore } from '../../src/sync/TaskMetadataStore';
import { TodoIntegratorSettings } from '../../src/types';

/**
 * SimpleLoggerのモックを作成
 */
export function createMockLogger(): jest.Mocked<SimpleLogger> {
	return {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		setLogLevel: jest.fn(),
		getLogLevel: jest.fn().mockReturnValue('info'),
		isDebugEnabled: jest.fn().mockReturnValue(false),
		isInfoEnabled: jest.fn().mockReturnValue(true),
		isWarnEnabled: jest.fn().mockReturnValue(true),
		isErrorEnabled: jest.fn().mockReturnValue(true),
		setLogToFile: jest.fn(),
		exportLogs: jest.fn().mockReturnValue(''),
		clearHistory: jest.fn(),
		getLogHistory: jest.fn().mockReturnValue([]),
	} as any;
}

/**
 * Obsidian Pluginのモックを作成
 */
export function createMockPlugin(): jest.Mocked<Plugin> {
	return {
		loadData: jest.fn().mockResolvedValue({}),
		saveData: jest.fn().mockResolvedValue(undefined),
		app: {
			vault: {
				getAbstractFileByPath: jest.fn(),
				read: jest.fn(),
				modify: jest.fn(),
				create: jest.fn(),
				adapter: {
					exists: jest.fn(),
				},
			},
			workspace: {
				getActiveFile: jest.fn(),
			},
			fileManager: {
				processFrontMatter: jest.fn(),
			},
		},
		manifest: {
			id: 'todo-integrator',
			name: 'Todo Integrator',
			version: '1.0.0',
		},
	} as any;
}

/**
 * TodoApiClientのモックを作成
 */
export function createMockApiClient(): jest.Mocked<TodoApiClient> {
	return {
		getTasks: jest.fn().mockResolvedValue([]),
		createTask: jest.fn(),
		createTaskWithStartDate: jest.fn(),
		completeTask: jest.fn(),
		updateTaskTitle: jest.fn(),
		getDefaultListId: jest.fn().mockReturnValue('default-list-id'),
		testConnection: jest.fn().mockResolvedValue({ success: true }),
	} as any;
}

/**
 * DailyNoteManagerのモックを作成
 */
export function createMockDailyNoteManager(): jest.Mocked<DailyNoteManager> {
	return {
		ensureTodayNoteExists: jest.fn(),
		getDailyNoteTasks: jest.fn().mockResolvedValue([]),
		getAllDailyNoteTasks: jest.fn().mockResolvedValue([]),
		addTaskToTodoSection: jest.fn(),
		updateTaskCompletion: jest.fn(),
		getTodayNotePath: jest.fn().mockReturnValue('Daily Notes/2024-01-01.md'),
		getNotePath: jest.fn(),
		createDailyNote: jest.fn(),  // 追加
		app: {} as any,
		settings: {} as any,
	} as any;
}

/**
 * TaskMetadataStoreのモックを作成
 */
export function createMockMetadataStore(): jest.Mocked<TaskMetadataStore> {
	return {
		setMetadata: jest.fn(),
		getMsftTaskId: jest.fn(),
		getMetadataByDate: jest.fn().mockReturnValue([]),
		findByMsftTaskId: jest.fn(),
		updateTitle: jest.fn(),
		removeMetadata: jest.fn(),
		cleanupOldMetadata: jest.fn(),
		clearAll: jest.fn(),
	} as any;
}

/**
 * TodoIntegratorSettingsのモックを作成
 */
export function createMockSettings(): TodoIntegratorSettings {
	return {
		clientId: 'test-client-id',
		tenantId: 'common',
		redirectPort: 42813,
		taskFolder: 'Tasks',
		dailyNotesPath: 'Daily Notes',
		taskSectionHeading: '## TODO',
		autoSync: false,
		syncInterval: 5,
		logLevel: 'info',
		lastSync: null,
		defaultListId: 'default-list-id',
		logToFile: false,
		autoCreateDailyNote: true,
		advancedConfigEnabled: false,
	};
}

/**
 * コンソールメソッドのモックをセットアップ
 */
export function mockConsole() {
	const originalConsole = {
		debug: console.debug,
		info: console.info,
		warn: console.warn,
		error: console.error,
	};

	beforeEach(() => {
		jest.spyOn(console, 'debug').mockImplementation();
		jest.spyOn(console, 'info').mockImplementation();
		jest.spyOn(console, 'warn').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
	});

	afterEach(() => {
		console.debug = originalConsole.debug;
		console.info = originalConsole.info;
		console.warn = originalConsole.warn;
		console.error = originalConsole.error;
	});
}

/**
 * Date.nowのモックをセットアップ
 */
export function mockDateNow(fixedDate: string = '2024-01-01T00:00:00Z') {
	const originalNow = Date.now;
	const fixedTimestamp = new Date(fixedDate).getTime();

	beforeEach(() => {
		Date.now = jest.fn(() => fixedTimestamp);
	});

	afterEach(() => {
		Date.now = originalNow;
	});

	return fixedTimestamp;
}