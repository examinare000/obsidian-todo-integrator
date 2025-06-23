// Jest setup file for ToDo Integrator tests
import 'jest';

// Set NODE_ENV to test before any imports
process.env.NODE_ENV = 'test';

// Mock console methods to avoid noise in tests
global.console = {
	...console,
	log: jest.fn(),
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};

// Mock timers
jest.useFakeTimers();

// Setup global test environment
beforeEach(() => {
	jest.clearAllMocks();
});

afterEach(() => {
	jest.restoreAllMocks();
});