export function getDisplayName(grade: number, className: string): string {
	if (className === 'default') return `${grade}`;
	if (className === 'IB') return `${grade}-IB`;
	return `${grade}-${className}`;
}

export function isProtectedClass(className: string): boolean {
	return className === '1' || className === 'IB';
}
