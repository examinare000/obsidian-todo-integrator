// Jest setup file for ToDo Integrator tests
import 'jest';

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