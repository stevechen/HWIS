<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { SemesterStatus } from '$lib/esl-semesters';

	let { status }: { status: SemesterStatus } = $props();

	const label = $derived(
		status === 'upcoming' ? 'Upcoming' : status === 'current' ? 'Current' : 'Closed'
	);
	const tint = $derived(
		status === 'upcoming'
			? 'border-amber-300 bg-amber-50 text-amber-900'
			: status === 'current'
				? 'border-emerald-300 bg-emerald-50 text-emerald-900'
				: 'border-gray-300 bg-gray-100 text-gray-700'
	);
</script>

<Badge data-testid="semester-status" variant="outline" class={tint}>{label}</Badge>
