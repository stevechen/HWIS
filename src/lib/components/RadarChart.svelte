<script lang="ts">
	import * as d3 from 'd3';
	import { schemeTableau10 } from 'd3-scale-chromatic';

	interface DataItem {
		label: string;
		[key: string]: number | string | undefined;
	}

	interface Props {
		data?: DataItem[];
		features?: string[];
		ticks?: number[];
		size?: number;
		colors?: string[];
		minValue?: number;
		maxValue?: number;
	}

	let {
		data = [],
		features = [],
		ticks = [2, 4, 6, 8, 10],
		size = 400,
		colors = Array.from({ length: 10 }, (_, i) => schemeTableau10[i]),
		minValue = 0,
		maxValue = 10
	}: Props = $props();

	const center = $derived(size / 2);
	const edgePadding = $derived(Math.max(8, Math.round(size * 0.02)));
	const featureFontSize = $derived(Math.max(10, Math.round((12 * size) / 460)));
	const tickFontSize = $derived(Math.max(8, Math.round((10 * size) / 460)));
	const tickLabelOffset = $derived(Math.max(8, Math.round(size * 0.02)));
	const featureLabelRadius = $derived(Math.max(0, center - edgePadding - featureFontSize));
	const labelGap = $derived(Math.max(30, Math.round(size * 0.075)));

	function getFeatureInitial(name: string) {
		const trimmed = name.trim();
		return trimmed.length > 0 ? trimmed[0].toUpperCase() : '';
	}

	const chartRadius = $derived(Math.max(0, featureLabelRadius - labelGap));

	const uniqueTicks = $derived([...new Set(ticks)]);

	// Convert simple data object to array format for D3
	const chartData = $derived.by((): DataItem[] => {
		if (data.length > 0) return data;
		// If data is empty but features exist, create sample data
		if (features.length > 0) {
			return features.map((feature, i) => ({
				label: `Series ${i}`,
				...Object.fromEntries(features.map((f) => [f, Math.random() * 8 + 1]))
			}));
		}
		return [];
	});

	// Create scales
	const radialScale = $derived(
		d3.scaleLinear().domain([minValue, maxValue]).range([0, chartRadius])
	);

	// Calculate feature angles and coordinates
	const featureData = $derived(
		features.map((name, index) => {
			const angle = Math.PI / 2 + (2 * Math.PI * index) / features.length;
			return {
				name,
				angle,
				line: angleToCoordinate(angle, maxValue, radialScale),
				tick: angleToCoordinate(angle, ticks[ticks.length - 1], radialScale)
			};
		})
	);

	function angleToCoordinate(angle: number, value: number, scale: d3.ScaleLinear<number, number>) {
		const radius = scale(value);
		return {
			x: center + radius * Math.cos(angle),
			y: center - radius * Math.sin(angle)
		};
	}

	function getPath(d: DataItem, features: string[], scale: d3.ScaleLinear<number, number>): string {
		const points = features.map((f, i) => {
			const angle = Math.PI / 2 + (2 * Math.PI * i) / features.length;
			const value = Number(d[f]) || 0;
			const coord = angleToCoordinate(angle, value, scale);
			return `${coord.x},${coord.y}`;
		});
		return `M ${points.join(' L ')} Z`;
	}

	function getTickCoordinate(angle: number, tick: number, scale: d3.ScaleLinear<number, number>) {
		return angleToCoordinate(angle, tick, scale);
	}

	function getTickLabelCoordinate(
		angle: number,
		tick: number,
		scale: d3.ScaleLinear<number, number>
	) {
		const coord = getTickCoordinate(angle, tick, scale);
		return {
			x: coord.x + tickLabelOffset * Math.cos(angle),
			y: coord.y - tickLabelOffset * Math.sin(angle)
		};
	}

	function getGridPath(tick: number): string {
		if (features.length === 0) return '';
		const points = features.map((_, i) => {
			const angle = Math.PI / 2 + (2 * Math.PI * i) / features.length;
			const coord = angleToCoordinate(angle, tick, radialScale);
			return `${coord.x},${coord.y}`;
		});
		return `M ${points.join(' L ')} Z`;
	}

	function getLabelBaseline(angle: number) {
		const sin = Math.sin(angle);
		if (sin > 0.25) return 'hanging';
		if (sin < -0.25) return 'auto';
		return 'middle';
	}

	function getTickBaseline(angle: number) {
		const sin = Math.sin(angle);
		if (sin > 0.25) return 'auto';
		if (sin < -0.25) return 'hanging';
		return 'middle';
	}
</script>

<div class="radar-chart-container" style="width: {size}px; height: {size}px;">
	<svg width={size} height={size}>
		<!-- Draw circles for ticks -->
		{#each uniqueTicks as tick (tick)}
			<path d={getGridPath(tick)} fill="none" stroke="#e5e7eb" stroke-width="1" />
		{/each}

		<!-- Draw axes -->
		{#each featureData as feature (feature.name)}
			<line
				x1={center}
				y1={center}
				x2={feature.line.x}
				y2={feature.line.y}
				stroke="#e5e7eb"
				stroke-width="1"
			/>
		{/each}

		<!-- Draw tick labels -->
		{#each uniqueTicks as tick (tick)}
			{#each featureData as feature (feature.name)}
				{#if tick !== 0}
					{@const labelCoord = getTickLabelCoordinate(feature.angle, tick, radialScale)}
					<text
						x={labelCoord.x}
						y={labelCoord.y}
						text-anchor="middle"
						dominant-baseline={getTickBaseline(feature.angle)}
						font-size={tickFontSize}
						fill="#9ca3af"
					>
						{tick}
					</text>
				{/if}
			{/each}
		{/each}

		<!-- Draw data paths -->
		{#each chartData as d, dIdx (d.label)}
			<path
				d={getPath(d, features, radialScale)}
				fill={colors[dIdx % colors.length]}
				fill-opacity="0.2"
				stroke={colors[dIdx % colors.length]}
				stroke-opacity="0.55"
				stroke-width="2"
			/>

			<!-- Draw data points -->
			{#each features as feature, fIdx (feature)}
				{@const angle = Math.PI / 2 + (2 * Math.PI * fIdx) / features.length}
				{@const value = Number(d[feature]) || 0}
				{@const coord = angleToCoordinate(angle, value, radialScale)}
				<circle
					cx={coord.x}
					cy={coord.y}
					r="4"
					fill={colors[dIdx % colors.length]}
					fill-opacity="0.6"
				/>
			{/each}
		{/each}

		<!-- Draw feature labels -->
		{#each featureData as feature (feature.name)}
			{@const x = center + featureLabelRadius * Math.cos(feature.angle)}
			{@const y = center - featureLabelRadius * Math.sin(feature.angle)}
			<text
				{x}
				{y}
				text-anchor="middle"
				dominant-baseline={getLabelBaseline(feature.angle)}
				font-size={featureFontSize}
				font-weight="500"
				fill="#374151"
			>
				{getFeatureInitial(feature.name)}
			</text>
		{/each}
	</svg>
</div>

<style>
	.radar-chart-container {
		display: block;
		margin: 0 auto;
	}
</style>
