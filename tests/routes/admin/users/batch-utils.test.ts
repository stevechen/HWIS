import { describe, it, expect } from 'vitest';
import { cleanName, initials } from '$src/routes/admin/users/batch-utils';

describe('cleanName', () => {
	it('returns English names unchanged', () => {
		expect(cleanName('John Smith')).toBe('John Smith');
	});

	it('removes CJK characters while keeping English', () => {
		expect(cleanName('John 約翰 Smith')).toBe('John Smith');
	});

	it('removes CJK from mixed name and trims', () => {
		expect(cleanName('詹姆斯 James 王')).toBe('James');
	});

	it('removes CJK-only names to empty string', () => {
		expect(cleanName('張三')).toBe('');
	});

	it('handles undefined/null/empty input gracefully', () => {
		expect(cleanName(undefined)).toBe('');
		expect(cleanName(null as unknown as string)).toBe('');
		expect(cleanName('')).toBe('');
	});

	it('preserves spaces between English parts after removing CJK', () => {
		expect(cleanName('Mary 林 Mary')).toBe('Mary Mary');
	});

	it('handles mixed punctuation and CJK', () => {
		expect(cleanName("O'Brien 奧賓 XIII")).toBe("O'Brien XIII");
	});
});

describe('initials', () => {
	it('extracts initials from English name', () => {
		expect(initials('John Smith')).toBe('JS');
	});

	it('extracts initials from a name with CJK characters', () => {
		expect(initials('John 約翰 Smith')).toBe('JS');
	});

	it('falls back to ? for undefined', () => {
		expect(initials(undefined)).toBe('?');
	});

	it('returns at most 2 initials', () => {
		expect(initials('John David Smith')).toBe('JD');
	});
});
