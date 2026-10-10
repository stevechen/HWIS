<script lang="ts">
</script>

<div class="mx-auto w-full max-w-6xl p-8">
	<h1 data-testid="esl-dashboard.title" class="text-2xl font-bold text-emerald-900">
		ESL Department
	</h1>
	<p data-testid="esl-dashboard.subtitle" class="text-muted-foreground mt-2">
		Schedule, slips, ZipGrade, and administration for the ESL department.
	</p>
	<nav aria-label="ESL sections" class="mt-6 grid gap-4 sm:grid-cols-2">
		<a
			href="/esl/schedule"
			data-testid="esl-dashboard.schedule"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Schedule</span>
			<span class="text-muted-foreground mt-1 block text-sm">Class timetables and sessions.</span>
		</a>
		<a
			href="/esl/schedule/calendar"
			data-testid="esl-dashboard.calendar"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Calendar</span>
			<span class="text-muted-foreground mt-1 block text-sm">Per-class semester calendar.</span>
		</a>
		<a
			href="/esl/slips"
			data-testid="esl-dashboard.slips"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Slips</span>
			<span class="text-muted-foreground mt-1 block text-sm">Permission and activity slips.</span>
		</a>
		<a
			href="/esl/zipgrade"
			data-testid="esl-dashboard.zipgrade"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">ZipGrade</span>
			<span class="text-muted-foreground mt-1 block text-sm">Graded answer sheets and results.</span
			>
		</a>
		<a
			href="/esl/admin"
			data-testid="esl-dashboard.admin"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Admin</span>
			<span class="text-muted-foreground mt-1 block text-sm">ESL department administration.</span>
		</a>
	</nav>
</div>
