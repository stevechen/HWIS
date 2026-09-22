<script lang="ts">
	// Reproduces the real height chain of /leaderboard/houses: the layout's
	// min-h-screen wrapper → the page's h-screen root → the theme's h-full
	// section. Without it the board collapses to content height, the cards come
	// out short, and chart geometry measured here would not match the wall.
	import LeaderboardHalloweenHouseWeb from '$lib/components/LeaderboardHalloweenHouseWeb.svelte';

	let {
		houses = [],
		categories = []
	}: {
		houses?: {
			house: string;
			rank: number;
			totalPoints: number;
			pointsByCategory?: Record<string, number>;
			topContributors?: { studentId: string; englishName: string; totalPoints: number }[];
		}[];
		categories?: string[];
	} = $props();
</script>

<div class="min-h-screen">
	<div class="h-screen">
		<LeaderboardHalloweenHouseWeb {houses} {categories} />
	</div>
</div>
