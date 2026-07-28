import { v } from 'convex/values';
import { HOUSES } from '$lib/constants/houses';

export type House = (typeof HOUSES)[number];

export const HOUSE_VALIDATOR = v.union(
	v.literal('Heracles'),
	v.literal('Wukong'),
	v.literal('Ixbalam'),
	v.literal('Setna')
);
