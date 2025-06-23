// Input sanitization utilities for security
export class InputSanitizer {
	static sanitize(input: string): string {
		return input.trim();
	}

	/**
	 * Sanitize HTML input to prevent XSS attacks
	 * @param input Raw user input
	 * @returns Sanitized string safe for display
	 */
	static sanitizeHtml(input: string): string {
		if (!input || typeof input !== 'string') {
			return '';
		}

		return input
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#x27;')
			.replace(/\//g, '&#x2F;');
	}

	/**
	 * Sanitize text input for use in file names
	 * @param input Raw filename input
	 * @returns Safe filename string
	 */
	static sanitizeFilename(input: string): string {
		if (!input || typeof input !== 'string') {
			return '';
		}

		// Remove dangerous characters from filenames
		return input
			.replace(/[<>:"|?*\\\/]/g, '')
			.replace(/\.\./g, '')
			.trim();
	}

	/**
	 * Sanitize path input to prevent path traversal
	 * @param input Raw path input
	 * @returns Safe path string
	 */
	static sanitizePath(input: string): string {
		if (!input || typeof input !== 'string') {
			return '';
		}

		// Normalize and validate path
		const normalized = input.trim().replace(/^\/+|\/+$/g, '');
		
		// Security check: prevent path traversal attacks
		if (normalized.includes('..') || normalized.includes('\\')) {
			throw new Error('Invalid path: Path traversal attempt detected');
		}
		
		// Additional security: ensure path doesn't contain dangerous characters
		if (/[<>:"|?*]/.test(normalized)) {
			throw new Error('Invalid path: Contains forbidden characters');
		}
		
		return normalized;
	}

	/**
	 * Validate and sanitize URL input
	 * @param input Raw URL input
	 * @returns Validated URL string or throws error
	 */
	static validateUrl(input: string): string {
		if (!input || typeof input !== 'string') {
			throw new Error('Invalid URL: Empty or non-string input');
		}

		try {
			const url = new URL(input);
			// Only allow https and http protocols
			if (!['https:', 'http:'].includes(url.protocol)) {
				throw new Error('Invalid URL: Only HTTP and HTTPS protocols are allowed');
			}
			return url.toString();
		} catch (error) {
			throw new Error(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Sanitize user input for display in notifications
	 * @param input Raw user input
	 * @returns Safe string for notifications
	 */
	static sanitizeForNotification(input: string): string {
		if (!input || typeof input !== 'string') {
			return '';
		}

		// Truncate long inputs and remove potentially dangerous content
		const truncated = input.length > 100 ? input.substring(0, 100) + '...' : input;
		return this.sanitizeHtml(truncated);
	}

	/**
	 * Validate string length and content
	 * @param input Input string to validate
	 * @param maxLength Maximum allowed length
	 * @param allowEmpty Whether empty strings are allowed
	 * @returns Validated string or throws error
	 */
	static validateString(input: string, maxLength: number = 1000, allowEmpty: boolean = false): string {
		if (!allowEmpty && (!input || input.trim().length === 0)) {
			throw new Error('Input cannot be empty');
		}

		if (input && input.length > maxLength) {
			throw new Error(`Input too long: maximum ${maxLength} characters allowed`);
		}

		return input || '';
	}
}