import { writable } from 'svelte/store';

export const headerTitleOverride = writable<string>('');

export const setHeaderTitleOverride = (title: string) => {
	headerTitleOverride.set(title);
};
