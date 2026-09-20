<script lang="ts">
	import type { CnyGlyph } from './cny-glyphs';

	let { glyph, class: cls = '' }: { glyph: CnyGlyph; class?: string } = $props();
</script>

<svg class={cls} viewBox={glyph.viewBox} fill="currentColor" aria-hidden="true">
	<!-- font outlines are y-up; flip into SVG's y-down space -->
	<g transform="scale(1,-1)">
		<path d={glyph.d} />
	</g>
</svg>
