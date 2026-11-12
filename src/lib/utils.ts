import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

/**
 * Points display multiplier.
 * Database stores canonical 1× values.
 * UI displays 10× values for better granularity perception.
 */
export const POINTS_MULTIPLIER = 10;

/**
 * Convert canonical (database) points to display (UI) points.
 *
 * Rounding at 12 significant digits strips binary-float noise from the
 * multiplication, so a value typed as `5.3` (stored canonically as `0.53`)
 * renders back as `5.3` instead of `5.300000000000001`. Display-only, so this
 * cannot alter stored data.
 *
 * @param points - Canonical points value (1×)
 * @returns Display points value (10×)
 */
export function toDisplayPoints(points: number): number {
	return Number((points * POINTS_MULTIPLIER).toPrecision(12));
}

/**
 * Convert display (UI) points to canonical (database) points.
 * @param points - Display points value (10×)
 * @returns Canonical points value (1×)
 */
export function fromDisplayPoints(points: number): number {
	return points / POINTS_MULTIPLIER;
}
