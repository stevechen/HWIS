<script lang="ts">
	import { page } from '$app/state';
	import StudentsAdmin from './StudentsAdmin.svelte';
	import StudentsPrototype from './StudentsPrototype.svelte';
</script>

{#if import.meta.env.DEV && page.url.searchParams.get('prototype') === '1'}
	<StudentsPrototype />
{:else}
	<StudentsAdmin />
{/if}
