<script lang="ts">
	import * as Card from '$lib/components/ui/card';
</script>

<div class="mx-auto w-full max-w-6xl p-8">
	<h1
		data-testid="esl-admin.title"
		class="text-2xl font-bold text-emerald-900 dark:text-emerald-100"
	>
		ESL Administration
	</h1>
	<p data-testid="esl-admin.subtitle" class="text-muted-foreground mt-2">
		Manage semesters and events, classes, class teachers, rosters, and ESL department staff.
	</p>
	<nav aria-label="ESL administration sections" class="mt-6 grid gap-4 sm:grid-cols-2">
		<a href="/esl/admin/semesters" data-testid="esl-admin.overview.semesters" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Semesters</Card.Title>
					<Card.Description>
						Create S1/S2 terms, seed their draft events, and place typed dates on the calendar.
					</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		<a href="/esl/admin/classes" data-testid="esl-admin.overview.classes" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Classes</Card.Title>
					<Card.Description>
						Create classes, pair CLIL/Comm classes, and assign class teachers.
					</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		<a href="/esl/admin/students" data-testid="esl-admin.overview.students" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Students</Card.Title>
					<Card.Description>
						View rosters, bulk import from CSV/TSV, and record transfers.
					</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		<a href="/esl/admin/users" data-testid="esl-admin.overview.users" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Users</Card.Title>
					<Card.Description>Assign ESL Admin and ESL Teacher roles to staff.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
		<a href="/esl/admin/backup" data-testid="esl-admin.overview.backup" class="block">
			<Card.Root class="hover:border-primary/50 cursor-pointer transition-all hover:shadow-md">
				<Card.Header>
					<Card.Title class="text-lg">Backup &amp; Restore</Card.Title>
					<Card.Description>Create and restore snapshots of ESL department data.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>
	</nav>
</div>
