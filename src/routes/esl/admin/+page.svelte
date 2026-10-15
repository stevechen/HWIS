<script lang="ts">
</script>

<div class="mx-auto w-full max-w-6xl p-8">
	<h1 data-testid="esl-admin.title" class="text-2xl font-bold text-emerald-900">
		ESL Administration
	</h1>
	<p data-testid="esl-admin.subtitle" class="text-muted-foreground mt-2">
		Manage semesters and events, classes, class teachers, rosters, and ESL department staff.
	</p>
	<nav aria-label="ESL administration sections" class="mt-6 grid gap-4 sm:grid-cols-2">
		<a
			href="/esl/admin/semesters"
			data-testid="esl-admin.overview.semesters"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Semesters</span>
			<span class="text-muted-foreground mt-1 block text-sm">
				Create S1/S2 terms, seed their draft events, and place typed dates on the calendar.
			</span>
		</a>
		<a
			href="/esl/admin/classes"
			data-testid="esl-admin.overview.classes"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Classes</span>
			<span class="text-muted-foreground mt-1 block text-sm">
				Create classes, pair CLIL/Comm classes, and assign class teachers.
			</span>
		</a>
		<a
			href="/esl/admin/students"
			data-testid="esl-admin.overview.students"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Students</span>
			<span class="text-muted-foreground mt-1 block text-sm">
				View rosters, bulk import from CSV/TSV, and record transfers.
			</span>
		</a>
		<a
			href="/esl/admin/users"
			data-testid="esl-admin.overview.users"
			class="rounded-lg border bg-white p-6 shadow-sm hover:shadow"
		>
			<span class="text-lg font-semibold">Users</span>
			<span class="text-muted-foreground mt-1 block text-sm">
				Assign ESL Admin and ESL Teacher roles to staff.
			</span>
		</a>
	</nav>
</div>
