import { v } from 'convex/values';

export const HOUSES = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;
export type House = (typeof HOUSES)[number];

export const HOUSE_VALIDATOR = v.union(
	v.literal('Heracles'),
	v.literal('Wukong'),
	v.literal('Ixbalam'),
	v.literal('Setna')
);
