import { writable } from 'svelte/store';
import type { Component } from 'svelte';

export const headerTitleOverride = writable<string>('');

// Svelte 5 component type
export type HouseLogoComponent = Component;
export const headerHouseBadge = writable<{ house: string; logo: HouseLogoComponent } | null>(null);

export const setHeaderTitleOverride = (title: string) => {
	headerTitleOverride.set(title);
};

export const setHeaderHouseBadge = (house: string, logo: HouseLogoComponent) => {
	headerHouseBadge.set({ house, logo });
};

export const clearHeaderHouseBadge = () => {
	headerHouseBadge.set(null);
};

// Teacher evaluation-scope control rendered in the global header, behind the
// student name on the student page. `visible` is toggled by the page; `scope`
// is the single source of truth for both the header tab and the page data.
export type TeacherScope = 'all' | 'mine';
export const headerTeacherScope = writable<TeacherScope>('all');
export const headerTeacherScopeVisible = writable<boolean>(false);
