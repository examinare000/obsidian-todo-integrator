// Mock implementation of Obsidian API for testing

export class App {
	workspace = {
		getActiveViewOfType: jest.fn(),
		on: jest.fn(),
		off: jest.fn(),
	};
	
	vault = {
		adapter: {
			exists: jest.fn(),
			read: jest.fn(),
			write: jest.fn(),
		},
		getAbstractFileByPath: jest.fn(),
		create: jest.fn(),
		modify: jest.fn(),
		read: jest.fn(),
		getMarkdownFiles: jest.fn(() => []),
	};
	
	metadataCache = {
		getFileCache: jest.fn(),
		on: jest.fn(),
		off: jest.fn(),
	};
}

export class Plugin {
	app: App;
	manifest: any;
	
	constructor(app: App, manifest: any) {
		this.app = app;
		this.manifest = manifest;
	}
	
	loadData = jest.fn();
	saveData = jest.fn();
	addRibbonIcon = jest.fn();
	addStatusBarItem = jest.fn(() => ({ setText: jest.fn() }));
	addCommand = jest.fn();
	addSettingTab = jest.fn();
	registerDomEvent = jest.fn();
	registerInterval = jest.fn();
}

export class Modal {
	app: App;
	contentEl = {
		setText: jest.fn(),
		empty: jest.fn(),
		createEl: jest.fn().mockImplementation((tag, props) => {
			const mockEl = {
				createEl: jest.fn().mockReturnThis(),
				appendChild: jest.fn(),
				setText: jest.fn(),
				onclick: null,
				textContent: props?.text || '',
				querySelector: jest.fn(),
				remove: jest.fn(),
				parentElement: {
					appendChild: jest.fn(),
				},
			};
			return mockEl;
		}),
		appendChild: jest.fn(),
		querySelector: jest.fn(),
		isConnected: true,
	};
	
	constructor(app: App) {
		this.app = app;
	}
	
	open = jest.fn();
	close = jest.fn();
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl = {
		empty: jest.fn(),
		createEl: jest.fn(),
		appendChild: jest.fn(),
	};
	
	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}
	
	display = jest.fn();
}

export class Setting {
	containerEl: any;
	
	constructor(containerEl: any) {
		this.containerEl = containerEl;
	}
	
	setName = jest.fn().mockReturnThis();
	setDesc = jest.fn().mockReturnThis();
	addText = jest.fn().mockReturnThis();
	addButton = jest.fn().mockReturnThis();
	addToggle = jest.fn().mockReturnThis();
}

export class Notice {
	constructor(message: string, timeout?: number) {}
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	
	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
		this.basename = this.name.split('.')[0];
		this.extension = this.name.split('.').pop() || '';
	}
}

export interface Editor {
	getSelection(): string;
	replaceSelection(text: string): void;
}

export interface MarkdownView {
	editor: Editor;
	file: TFile;
}