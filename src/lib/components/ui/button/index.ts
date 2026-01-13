/* eslint-disable @typescript-eslint/no-unused-vars */
import Root from './button.svelte';
import { buttonVariants } from './button.svelte';
import type { VariantProps } from 'class-variance-authority';

export type { ButtonVariant, ButtonSize } from './button.svelte';

export {
	Root,
	buttonVariants,
	//
	Root as Button
};
