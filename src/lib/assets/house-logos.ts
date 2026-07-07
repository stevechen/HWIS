import LogoHeracles from '$lib/components/LogoHeracles.svelte';
import LogoWukong from '$lib/components/LogoWukong.svelte';
import LogoIxbalam from '$lib/components/LogoIxbalam.svelte';
import LogoSetna from '$lib/components/LogoSetna.svelte';
import type { House } from '$lib/constants/houses';

export const houseLogos: Record<House, typeof LogoHeracles> = {
	Heracles: LogoHeracles,
	Wukong: LogoWukong,
	Ixbalam: LogoIxbalam,
	Setna: LogoSetna
};
