<script lang="ts">
	import type { Department } from '$lib/department';

	let {
		active = 'international',
		onSwitch = () => {}
	}: {
		active?: Department;
		onSwitch?: (department: Department) => void;
	} = $props();
</script>

<div
	role="group"
	aria-label="Department switcher"
	data-testid="department-switcher"
	class="inline-flex shrink-0 overflow-hidden rounded-md border border-white/40 text-xs"
>
	<button
		type="button"
		data-testid="department-switcher.hwis"
		class="min-w-8 p-1 font-medium {active === 'international'
			? 'bg-white text-blue-950'
			: 'bg-transparent text-white hover:bg-white/20'}"
		aria-pressed={active === 'international'}
		onclick={() => onSwitch('international')}
	>
		HWIS
	</button>
	<button
		type="button"
		data-testid="department-switcher.esl"
		class="min-w-8 p-1 font-medium {active === 'esl'
			? 'bg-white text-blue-950'
			: 'bg-transparent text-white hover:bg-white/20'}"
		aria-pressed={active === 'esl'}
		onclick={() => onSwitch('esl')}
	>
		ESL
	</button>
</div>
