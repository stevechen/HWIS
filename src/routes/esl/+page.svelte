<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { useViewer } from '$lib/viewer.svelte';

	const session = useViewer();
</script>

<div class="mx-auto w-full max-w-6xl p-8">
	<h1
		data-testid="esl-dashboard.title"
		class="text-2xl font-bold text-emerald-900 dark:text-emerald-100"
	>
		ESL Department
	</h1>
	<p data-testid="esl-dashboard.subtitle" class="text-muted-foreground mt-2">
		Schedule, slips, ZipGrade, and administration for the ESL department.
	</p>
	<nav aria-label="ESL sections" class="mt-6 grid gap-4 sm:grid-cols-2">
		<a href="/esl/schedule" data-testid="esl-dashboard.schedule" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Schedule</Card.Title>
					<Card.Description>Class timetables and sessions.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		<a href="/esl/schedule/calendar" data-testid="esl-dashboard.calendar" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Calendar</Card.Title>
					<Card.Description>Per-class semester calendar.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		<a href="/esl/slips" data-testid="esl-dashboard.slips" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Slips</Card.Title>
					<Card.Description>Permission and activity slips.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		<a href="/esl/zipgrade" data-testid="esl-dashboard.zipgrade" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">ZipGrade</Card.Title>
					<Card.Description>Graded answer sheets and results.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		{#if session.isEslAdmin}
			<a href="/esl/admin" data-testid="esl-dashboard.admin" class="block">
				<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
					<Card.Header>
						<Card.Title class="text-lg">Admin</Card.Title>
						<Card.Description>ESL department administration.</Card.Description>
					</Card.Header>
				</Card.Root>
			</a>
		{/if}
	</nav>
</div>
