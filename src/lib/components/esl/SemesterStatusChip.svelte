<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { SemesterStatus } from '$lib/esl-semesters';

	let { status }: { status: SemesterStatus } = $props();

	const label = $derived(
		status === 'upcoming' ? 'Upcoming' : status === 'current' ? 'Current' : 'Closed'
	);
	const tint = $derived(
		status === 'upcoming'
			? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100'
			: status === 'current'
				? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100'
				: 'border-border bg-muted text-foreground'
	);
</script>

<Badge data-testid="semester-status" variant="outline" class={tint}>{label}</Badge>
