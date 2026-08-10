type ParsedCsvRow = Record<string, string>;

export function matchFieldName(header: string): string | null {
	const s = header
		.trim()
		.toLowerCase()
		.replace(/^\ufeff/, '');

	if (/student/.test(s)) return 'studentId';
	if (/english/.test(s)) return 'englishName';
	if (/chinese/.test(s)) return 'chineseName';
	if (/house/.test(s)) return 'house';
	if (/status/.test(s)) return 'status';
	if (/grade/.test(s) || /class/.test(s)) return 'gradeClass';

	return null;
}

export function parseCsv(text: string): ParsedCsvRow[] {
	const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentCell = '';
	let inQuotes = false;

	for (let i = 0; i < normalized.length; i++) {
		const char = normalized[i];
		const nextChar = normalized[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				currentCell += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === ',' && !inQuotes) {
			currentRow.push(currentCell);
			currentCell = '';
			continue;
		}

		if (char === '\n' && !inQuotes) {
			currentRow.push(currentCell);
			rows.push(currentRow);
			currentRow = [];
			currentCell = '';
			continue;
		}

		currentCell += char;
	}

	if (currentCell.length > 0 || currentRow.length > 0) {
		currentRow.push(currentCell);
		rows.push(currentRow);
	}

	if (rows.length === 0) {
		return [];
	}

	const headers = rows[0].map((h) => matchFieldName(h));
	const dataRows: ParsedCsvRow[] = [];
	for (let i = 1; i < rows.length; i++) {
		const rowValues = rows[i];
		if (rowValues.every((v) => v.trim() === '')) {
			continue;
		}
		const row: ParsedCsvRow = {};
		for (let j = 0; j < headers.length; j++) {
			const key = headers[j];
			if (key) {
				row[key] = (rowValues[j] ?? '').trim();
			}
		}
		dataRows.push(row);
	}
	return dataRows;
}

export function parseGradeAndClass(value: string): { grade: number; class: string } {
	const cleaned = value.trim();
	const match = cleaned.match(/(?:^|[^\d])(7|8|9|10|11|12)(?:(?:\s*-\s*|\s+class\s*)(IB|\d+))?/i);
	if (!match) {
		throw new Error('Grade must be between 7 and 12');
	}

	const grade = Number(match[1]);
	const classValue = match[2];
	if (!classValue) return { grade, class: 'default' };

	const normalizedClass = classValue.toUpperCase();
	if (normalizedClass === 'IB') {
		if (grade < 11) throw new Error('IB classes are only available for grades 11 and 12');
		return { grade, class: 'IB' };
	}

	const classNumber = Number(normalizedClass);
	if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 9) {
		throw new Error('Class must be between 1 and 9');
	}

	return { grade, class: normalizedClass };
}

export function mapCsvRowToStudent(row: ParsedCsvRow): {
	englishName: string;
	chineseName: string;
	studentId: string;
	grade: number;
	class?: string;
	status?: 'Enrolled' | 'Not Enrolled';
	house?: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna';
} {
	const englishName = row.englishName || '';
	const chineseName = row.chineseName || '';
	const studentId = row.studentId || '';
	const gradeValue = row.gradeClass || '';
	const gradeClass = parseGradeAndClass(gradeValue);
	const rawStatus = (row.status || '').trim();
	let parsedStatus: 'Enrolled' | 'Not Enrolled' | undefined = undefined;
	if (rawStatus.toLowerCase() === 'enrolled') parsedStatus = 'Enrolled';
	if (rawStatus.toLowerCase() === 'not enrolled') parsedStatus = 'Not Enrolled';

	const rawHouse = (row.house || '').trim();
	let parsedHouse: 'Heracles' | 'Wukong' | 'Ixbalam' | 'Setna' | undefined = undefined;
	if (rawHouse.toLowerCase() === 'heracles') parsedHouse = 'Heracles';
	if (rawHouse.toLowerCase() === 'wukong') parsedHouse = 'Wukong';
	if (rawHouse.toLowerCase() === 'ixbalam') parsedHouse = 'Ixbalam';
	if (rawHouse.toLowerCase() === 'setna') parsedHouse = 'Setna';

	return {
		englishName,
		chineseName,
		studentId,
		grade: gradeClass.grade,
		class: gradeClass.class,
		status: parsedStatus,
		house: parsedHouse
	};
}
