# Todo Integrator Plugin - Development Guide

## First time developing plugins?

Quick starting guide for new plugin devs:

- Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)! There might be an existing plugin similar enough that you can partner up with.
- Make a copy of this repo as a template with the "Use this template" button (login to GitHub if you don't see it).
- Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
- Install NodeJS, then run `npm i` in the command line under your repo folder.
- Run `npm run dev` to compile your plugin from `main.ts` to `main.js`.
- Make changes to `main.ts` (or create new `.ts` files). Those changes should be automatically compiled into `main.js`.
- Reload Obsidian to load the new version of your plugin.
- Enable plugin in settings window.
- For updates to the Obsidian API run `npm update` in the command line under your repo folder.

## Development Setup

### Prerequisites
- Node.js v16 or higher (`node --version`)
- npm or yarn package manager
- Obsidian v0.15.0 or higher

### Installation
```bash
# Clone the repository
git clone https://github.com/examinare000/obsidian-todo-integrator.git

# Navigate to the project directory
cd obsidian-todo-integrator

# Install dependencies
npm install
```

### Development Commands
```bash
# Start development with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Version bump (patch/minor/major)
npm version patch
npm version minor
npm version major
```

## Architecture

For detailed architecture information, see [design.md](./design.md).


## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- todoSynchronizer.test.ts

# Run tests with coverage
npm test -- --coverage
```

### Test Structure
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- Mocks: `tests/__mocks__/`

## Code Quality

### ESLint
```bash
# Install ESLint globally
npm install -g eslint

# Run ESLint
eslint src/**/*.ts

# Fix auto-fixable issues
eslint src/**/*.ts --fix
```

### TypeScript
The project uses strict TypeScript settings. Ensure your code passes type checking:
```bash
# Type check
npm run typecheck
```

## Releasing

### Version Management
1. Update version in `manifest.json`
2. Update minimum Obsidian version if needed
3. Run `npm version [patch|minor|major]` to update all version files

### Creating a Release
1. Create a new GitHub release
2. Use the version number as the tag (e.g., `0.3.1`, not `v0.3.1`)
3. Upload the following files as binary attachments:
   - `manifest.json`
   - `main.js`
   - `styles.css` (if applicable)

### Community Plugin Submission
1. Ensure you have a proper `README.md`
2. Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
3. Submit a pull request to https://github.com/obsidianmd/obsidian-releases

## Test Coverage

### Current Status (v0.3.5)
- **Total Tests**: 366 passing (4 skipped)
- **Test Suites**: 29 (all passing)
- **Execution Time**: ~0.85 seconds
- **Overall Coverage**: 
  - Statements: 59.11%
  - Branches: 52.54%
  - Functions: 56.05%
  - Lines: 59.30%

### High Coverage Components (80%+)
- **ObsidianTodoParser**: 93.05%
- **TaskMetadataStore**: 96.42%
- **DailyNotesDetector**: 100%
- **DataViewCompat**: 95.34%
- **ErrorHandler**: 86.2%
- **InputSanitizer**: 96.96%
- **SecureErrorHandler**: 100%
- **MicrosoftTodoService**: 83.51%
- **SimpleLogger**: 90.27%
- **TodoSynchronizer**: 80.28%

### Test Philosophy
1. **Test as Specification**: Tests serve as living documentation
2. **TDD Approach**: Write tests before implementation
3. **Comprehensive Coverage**: Include edge cases and error scenarios
4. **Atomic Tests**: Each test verifies one specific behavior

## Implementation Details

### Title Cleaning (v0.3.1+)
- Removes [todo::ID] patterns from legacy bugs
- Regular expression: `/\[todo::[^\]]*\]/g`
- Applied during sync operations
- Updates Microsoft To Do titles via API

### Metadata Storage (v0.2.5+)
- Tasks identified by [date, title] tuple
- Microsoft To Do IDs stored separately
- 90-day automatic cleanup
- Persisted as Obsidian plugin data

### Timezone Handling (v0.3.4+)
- UTC datetime strings parsed correctly
- Automatic Z suffix addition when missing
- JavaScript Date object handles local conversion
- Works globally across all timezones

### DataView Compatibility (v0.3.5+)
- Auto-detects DataView plugin
- Reads DataView task completion settings
- Supports emoji shorthand (✅ YYYY-MM-DD)
- Supports inline fields ([completion:: YYYY-MM-DD])
- Handles custom completion text

### Security Implementation
- **InputSanitizer**: XSS prevention, path traversal protection
- **SecureErrorHandler**: Masks sensitive information in errors
- **PathValidator**: Validates and normalizes file paths
- All user inputs sanitized before use
- Error messages scrubbed of sensitive data

## Development Best Practices

### Git Workflow
- Use feature branches for all development
- Follow atomic commit principles
- Write descriptive commit messages in Japanese
- Never commit directly to main/master

### Code Style
- No nested if statements (zero tolerance)
- Maximum function length: 20 lines
- Single responsibility principle
- Test-driven development

### Testing Requirements
- Write tests before implementation
- Maintain high test coverage
- Include edge cases
- Test error scenarios

## API Documentation

- Obsidian API: https://github.com/obsidianmd/obsidian-api
- Microsoft Graph API: https://docs.microsoft.com/en-us/graph/
- MSAL.js: https://github.com/AzureAD/microsoft-authentication-library-for-js

## Troubleshooting

### Common Issues

#### Build Errors
- Ensure Node.js version is 16 or higher
- Delete `node_modules` and run `npm install`
- Check for TypeScript errors with `npm run typecheck`

#### Test Failures
- Ensure all mocks are properly set up
- Check for async/await issues
- Verify test data matches expected format

#### Plugin Not Loading
- Check console for errors (Ctrl+Shift+I)
- Ensure `manifest.json` is valid
- Verify minimum Obsidian version

## Contributing

Please read our contributing guidelines before submitting pull requests.

1. Fork the repository
2. Create a feature branch
3. Write tests for your changes
4. Ensure all tests pass
5. Submit a pull request

## Support

For bug reports and feature requests, please use GitHub Issues.
