<script lang="ts">
	import { houseLogos } from '$lib/assets/house-logos';
	import type { House } from '$lib/constants/houses';

	let { house }: { house: House } = $props();

	const Logo = $derived(houseLogos[house]);
</script>

<Logo />
