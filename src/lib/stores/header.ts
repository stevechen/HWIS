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
