export const HOUSES = ['Heracles', 'Wukong', 'Ixbalam', 'Setna'] as const;
export type House = (typeof HOUSES)[number];

export const HOUSE_COLORS: Record<
	House,
	{ bg: string; text: string; lightBg: string; border: string }
> = {
	Heracles: {
		bg: 'bg-red-600',
		text: 'text-red-700',
		lightBg: 'bg-red-50',
		border: 'border-red-500'
	},
	Wukong: {
		bg: 'bg-amber-600',
		text: 'text-amber-700',
		lightBg: 'bg-amber-50',
		border: 'border-amber-500'
	},
	Ixbalam: {
		bg: 'bg-emerald-600',
		text: 'text-emerald-700',
		lightBg: 'bg-emerald-50',
		border: 'border-emerald-500'
	},
	Setna: {
		bg: 'bg-blue-600',
		text: 'text-blue-700',
		lightBg: 'bg-blue-50',
		border: 'border-blue-500'
	}
};
