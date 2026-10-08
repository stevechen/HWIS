<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';

	let {
		open = $bindable(false),
		teacherName,
		year
	}: {
		open?: boolean;
		teacherName: string;
		/** The profile's selected school year — the grid ticket #167 builds reads this year. */
		year: string;
	} = $props();
</script>

<!--
	Placeholder shell for the read-only weekly schedule dialog (spec #164
	stories 17–23, ticket #167).

	The button wiring, dialog chrome, and year scoping land here so #167 only
	has to fill the body: a Monday–Friday by period 1–8 grid merging the
	teacher's ESL classes (short name plus room) with NA blocks for `year`,
	read through the existing staff profile query plus the blocked-slots list
	query. Nothing here writes.
-->
<Dialog.Root bind:open>
	<Dialog.Content class="max-w-2xl" testId="esl-admin-user-profile.schedule.dialog">
		<Dialog.Header>
			<Dialog.Title>Weekly schedule</Dialog.Title>
			<Dialog.Description>
				{teacherName} · {year} — ESL classes plus NA blocks, one week at a glance.
			</Dialog.Description>
		</Dialog.Header>

		<div
			data-testid="esl-admin-user-profile.schedule.placeholder"
			class="rounded-lg border border-dashed bg-white px-4 py-10 text-center"
		>
			<Badge variant="outline">Placeholder</Badge>
			<p class="text-muted-foreground mt-2 text-sm">
				The weekly schedule grid lands with ticket #167 — it will show {teacherName}'s ESL classes
				and NA blocks for {year} here.
			</p>
		</div>

		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (open = false)}
				testId="esl-admin-user-profile.schedule.close"
			>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
