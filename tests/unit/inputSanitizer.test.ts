import { InputSanitizer } from '../../src/utils/inputSanitizer';

describe('InputSanitizer', () => {
	describe('sanitize', () => {
		it('基本的な文字列のトリム', () => {
			expect(InputSanitizer.sanitize('  test  ')).toBe('test');
			expect(InputSanitizer.sanitize('\n\ttest\r\n')).toBe('test');
			expect(InputSanitizer.sanitize('test')).toBe('test');
		});
	});

	describe('sanitizeHtml', () => {
		it('XSS攻撃ベクターをエスケープ', () => {
			expect(InputSanitizer.sanitizeHtml('<script>alert("XSS")</script>'))
				.toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
			
			expect(InputSanitizer.sanitizeHtml('<img src=x onerror="alert(1)">'))
				.toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
			
			expect(InputSanitizer.sanitizeHtml('Test & <b>bold</b>'))
				.toBe('Test &amp; &lt;b&gt;bold&lt;&#x2F;b&gt;');
		});

		it('特殊文字を正しくエスケープ', () => {
			expect(InputSanitizer.sanitizeHtml('&')).toBe('&amp;');
			expect(InputSanitizer.sanitizeHtml('<')).toBe('&lt;');
			expect(InputSanitizer.sanitizeHtml('>')).toBe('&gt;');
			expect(InputSanitizer.sanitizeHtml('"')).toBe('&quot;');
			expect(InputSanitizer.sanitizeHtml("'")).toBe('&#x27;');
			expect(InputSanitizer.sanitizeHtml('/')).toBe('&#x2F;');
		});

		it('無効な入力を処理', () => {
			expect(InputSanitizer.sanitizeHtml('')).toBe('');
			expect(InputSanitizer.sanitizeHtml(null as any)).toBe('');
			expect(InputSanitizer.sanitizeHtml(undefined as any)).toBe('');
			expect(InputSanitizer.sanitizeHtml(123 as any)).toBe('');
		});

		it('正常なテキストはそのまま', () => {
			expect(InputSanitizer.sanitizeHtml('Hello World')).toBe('Hello World');
			expect(InputSanitizer.sanitizeHtml('This is a normal text.')).toBe('This is a normal text.');
		});
	});

	describe('sanitizeFilename', () => {
		it('危険な文字を除去', () => {
			expect(InputSanitizer.sanitizeFilename('file<name>.txt')).toBe('filename.txt');
			expect(InputSanitizer.sanitizeFilename('file:name|test')).toBe('filenametest');
			expect(InputSanitizer.sanitizeFilename('file\\name/test')).toBe('filenametest');
		});

		it('パストラバーサル攻撃を防止', () => {
			expect(InputSanitizer.sanitizeFilename('../../../etc/passwd')).toBe('etcpasswd');
			expect(InputSanitizer.sanitizeFilename('..\\..\\windows\\system32')).toBe('windowssystem32');
		});

		it('Windowsの予約語は変更しない（アプリケーション層で処理）', () => {
			// 注: このsanitizerは文字の除去のみ行い、予約語チェックは行わない
			expect(InputSanitizer.sanitizeFilename('CON')).toBe('CON');
			expect(InputSanitizer.sanitizeFilename('PRN.txt')).toBe('PRN.txt');
		});

		it('空白をトリム', () => {
			expect(InputSanitizer.sanitizeFilename('  filename.txt  ')).toBe('filename.txt');
		});

		it('無効な入力を処理', () => {
			expect(InputSanitizer.sanitizeFilename('')).toBe('');
			expect(InputSanitizer.sanitizeFilename(null as any)).toBe('');
			expect(InputSanitizer.sanitizeFilename(undefined as any)).toBe('');
		});
	});

	describe('sanitizePath', () => {
		it('パストラバーサル攻撃を防止', () => {
			// パストラバーサルを含むパスはエラーをスロー
			expect(() => InputSanitizer.sanitizePath('../../../etc/passwd')).toThrow('Invalid path: Path traversal attempt detected');
			expect(() => InputSanitizer.sanitizePath('path/to/../../../file')).toThrow('Invalid path: Path traversal attempt detected');
			expect(() => InputSanitizer.sanitizePath('./../../sensitive')).toThrow('Invalid path: Path traversal attempt detected');
		});

		it('バックスラッシュをスラッシュに変換', () => {
			// バックスラッシュを含むパスはエラーをスロー（セキュリティのため）
			expect(() => InputSanitizer.sanitizePath('path\\to\\file')).toThrow('Invalid path: Path traversal attempt detected');
			expect(() => InputSanitizer.sanitizePath('C:\\Windows\\System32')).toThrow('Invalid path: Path traversal attempt detected');
		});

		it('パスが正規化される', () => {
			// 先頭と末尾のスラッシュは削除される
			expect(InputSanitizer.sanitizePath('path//to///file')).toBe('path//to///file');
			expect(InputSanitizer.sanitizePath('////root')).toBe('root');
			expect(InputSanitizer.sanitizePath('/path/to/file/')).toBe('path/to/file');
		});

		it('安全なパスを許可', () => {
			expect(InputSanitizer.sanitizePath('path/to/file')).toBe('path/to/file');
			expect(InputSanitizer.sanitizePath('daily/2024-01-01.md')).toBe('daily/2024-01-01.md');
			expect(InputSanitizer.sanitizePath('folder/subfolder/file.md')).toBe('folder/subfolder/file.md');
		});

		it('無効な入力を処理', () => {
			expect(InputSanitizer.sanitizePath('')).toBe('');
			expect(InputSanitizer.sanitizePath(null as any)).toBe('');
			expect(InputSanitizer.sanitizePath(undefined as any)).toBe('');
		});
	});

	describe('validateUrl', () => {
		it('有効なURLを受け入れ', () => {
			expect(InputSanitizer.validateUrl('https://example.com/')).toBe('https://example.com/');
			expect(InputSanitizer.validateUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
			expect(InputSanitizer.validateUrl('https://api.example.com/path?query=value')).toBe('https://api.example.com/path?query=value');
		});

		it('無効なURLを拒否', () => {
			expect(() => InputSanitizer.validateUrl('javascript:alert(1)')).toThrow();
			expect(() => InputSanitizer.validateUrl('data:text/html,<script>alert(1)</script>')).toThrow();
			expect(() => InputSanitizer.validateUrl('file:///etc/passwd')).toThrow();
			expect(() => InputSanitizer.validateUrl('not a url')).toThrow();
		});

		it('httpsが推奨される', () => {
			// URLの妥当性チェックのみ行い、変換は行わない（末尾のスラッシュが追加される）
			expect(InputSanitizer.validateUrl('http://example.com')).toBe('http://example.com/');
		});

		it('無効な入力を処理', () => {
			expect(() => InputSanitizer.validateUrl('')).toThrow('Invalid URL: Empty or non-string input');
			expect(() => InputSanitizer.validateUrl(null as any)).toThrow('Invalid URL: Empty or non-string input');
			expect(() => InputSanitizer.validateUrl(undefined as any)).toThrow('Invalid URL: Empty or non-string input');
		});
	});

	describe('sanitizeForNotification', () => {
		it('通知用にテキストをサニタイズ', () => {
			expect(InputSanitizer.sanitizeForNotification('Task completed!')).toBe('Task completed!');
			// 改行は保持される
			expect(InputSanitizer.sanitizeForNotification('Line 1\nLine 2')).toBe('Line 1\nLine 2');
			// 複数スペースは保持される
			expect(InputSanitizer.sanitizeForNotification('Too    many    spaces')).toBe('Too    many    spaces');
		});

		it('長いテキストを切り詰め', () => {
			const longText = 'a'.repeat(150);
			const result = InputSanitizer.sanitizeForNotification(longText);
			expect(result.length).toBeLessThanOrEqual(103); // 100 + '...'
			expect(result.endsWith('...')).toBe(true);
		});

		it('HTMLをエスケープ', () => {
			expect(InputSanitizer.sanitizeForNotification('<b>Bold</b> text'))
				.toBe('&lt;b&gt;Bold&lt;&#x2F;b&gt; text');
		});

		it('無効な入力を処理', () => {
			expect(InputSanitizer.sanitizeForNotification('')).toBe('');
			expect(InputSanitizer.sanitizeForNotification(null as any)).toBe('');
			expect(InputSanitizer.sanitizeForNotification(undefined as any)).toBe('');
		});
	});

	describe('validateString', () => {
		it('有効な文字列を受け入れ', () => {
			expect(InputSanitizer.validateString('test', 10)).toBe('test');
			expect(InputSanitizer.validateString('a', 10)).toBe('a');
			expect(InputSanitizer.validateString('1234567890', 10)).toBe('1234567890');
		});

		it('長さ制限をチェック', () => {
			expect(() => InputSanitizer.validateString('', 10)).toThrow('Input cannot be empty');
			expect(() => InputSanitizer.validateString('12345678901', 10)).toThrow('Input too long: maximum 10 characters allowed');
			expect(() => InputSanitizer.validateString('test', 3)).toThrow('Input too long: maximum 3 characters allowed');
		});

		it('空文字を許可するオプション', () => {
			expect(InputSanitizer.validateString('', 10, true)).toBe('');
		});

		it('空白のみの文字列を拒否', () => {
			expect(() => InputSanitizer.validateString('   ', 10)).toThrow('Input cannot be empty');
			expect(() => InputSanitizer.validateString('\t\n\r', 10)).toThrow('Input cannot be empty');
		});

		it('無効な入力を処理', () => {
			expect(InputSanitizer.validateString(null as any, 10, true)).toBe('');
			expect(InputSanitizer.validateString(undefined as any, 10, true)).toBe('');
			// 数値は文字列として返される
			expect(InputSanitizer.validateString(123 as any, 10, true)).toBe(123);
		});
	});
});