import { browser } from '$app/environment';
import { writable } from 'svelte/store';

type Theme = 'light' | 'dark';

function createThemeStore() {
	let currentValue: Theme = 'light';
	const { subscribe, set } = writable<Theme>('light');

	function persist(theme: Theme) {
		if (!browser) return;
		currentValue = theme;
		localStorage.setItem('theme', theme);
		document.documentElement.classList.toggle('dark', theme === 'dark');
		set(theme);
	}

	return {
		subscribe,
		init: () => {
			if (browser) {
				const stored = localStorage.getItem('theme') as Theme | null;
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				persist(stored || (prefersDark ? 'dark' : 'light'));
			}
		},
		toggle: () => persist(currentValue === 'light' ? 'dark' : 'light'),
		setTheme: (theme: Theme) => persist(theme)
	};
}

export const theme = createThemeStore();
