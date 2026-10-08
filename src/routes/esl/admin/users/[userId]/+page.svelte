<script lang="ts">
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { CalendarClock, CalendarDays } from '@lucide/svelte';
	import { useViewer } from '$lib/viewer.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { initials } from '$lib/utils/names';
	import { ESL_DAY_LABELS, eslMeetingLabel, eslPeriodTimes, type EslDay } from '$convex/shared/esl';
	import { schoolYearOf } from '../../classes/staging';
	import SetAvailabilityDialog from './SetAvailabilityDialog.svelte';
	import WeeklyScheduleDialog from './WeeklyScheduleDialog.svelte';
	import {
		currentEslSlot,
		isSchoolDay,
		nextMeetingToday,
		taipeiNow,
		type TeacherMeeting
	} from './teacher-now';

	const session = useViewer();
	const userId = $derived(page.params.userId ?? '');

	const fallbackYear = schoolYearOf(new Date());
	let selectedYear = $state('');
	const displayYear = $derived(selectedYear || fallbackYear);

	const profileQuery = useQuery(api.esl.staff.getProfile, () =>
		userId ? { userId: userId as Id<'users'>, year: displayYear } : 'skip'
	);
	const profile = $derived(profileQuery.data ?? null);
	const loadFailed = $derived(profileQuery.error !== null && profileQuery.error !== undefined);
	const notFound = $derived(
		loadFailed &&
			/not found/i.test(profileQuery.error instanceof Error ? profileQuery.error.message : '')
	);

	$effect(() => {
		const years = profile?.years ?? [];
		if (!selectedYear && years.length > 0) {
			selectedYear = years[0];
		}
	});

	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => {
			now = new Date();
		}, 60000);
		return () => clearInterval(id);
	});

	type ProfileClass = NonNullable<typeof profile>['classes'][number];
	type ClassEntry = { cls: ProfileClass } & TeacherMeeting;

	const classes = $derived(profile?.classes ?? []);
	const entries = $derived<ClassEntry[]>(
		classes.flatMap((cls) => cls.meetings.map((meeting) => ({ cls, ...meeting })))
	);
	const totalPeriods = $derived(entries.length);

	const realYear = $derived(schoolYearOf(now));
	const isPastYear = $derived(displayYear !== realYear);

	const slot = $derived(currentEslSlot(now));
	const currentEntry = $derived<ClassEntry | null>(
		slot
			? (entries.find((entry) => entry.day === slot.day && entry.period === slot.period) ?? null)
			: null
	);
	const taipei = $derived(taipeiNow(now));
	const nextEntry = $derived.by<ClassEntry | null>(() => {
		if (currentEntry || !isSchoolDay(taipei.weekday)) return null;
		const next = nextMeetingToday(entries, taipei.weekday, taipei.minutes);
		if (!next) return null;
		return entries.find((entry) => entry.day === next.day && entry.period === next.period) ?? null;
	});

	function roleLabel(role: string | null): string {
		if (role === 'admin') return 'ESL Admin';
		if (role === 'teacher') return 'ESL Teacher';
		return 'No ESL role';
	}

	function eslBadgeClass(role: string | null): string {
		if (role === 'admin') return 'border-emerald-300 bg-emerald-100 text-emerald-700';
		if (role === 'teacher') return 'border-sky-300 bg-sky-100 text-sky-700';
		return '';
	}

	function roomLabel(room: string | null): string {
		return room ?? 'Room not set';
	}

	function entryLabel(entry: ClassEntry): string {
		const times = eslPeriodTimes(entry.period);
		const when = times ? ` (${times.start}–${times.end})` : '';
		return `${entry.cls.name} · ${roomLabel(entry.cls.room)} · ${ESL_DAY_LABELS[entry.day as EslDay]} P${entry.period}${when}`;
	}

	function isSelf(): boolean {
		return session.viewer?._id === userId;
	}

	let availabilityOpen = $state(false);
	let scheduleOpen = $state(false);
	let notice = $state('');

	/**
	 * The availability dialog's success confirmation: it closes itself on a
	 * landed write, and the page states what landed for which year.
	 */
	function handleAvailabilitySaved(savedYear: string, count: number) {
		notice =
			count === 0
				? `Availability saved for ${savedYear}: all periods available`
				: `Availability saved for ${savedYear}: ${count} blocked ${count === 1 ? 'period' : 'periods'}`;
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<a
		href="/esl/admin/users"
		data-testid="esl-admin-user-profile.back"
		class="text-sm font-medium text-emerald-800 hover:underline">← Back to ESL users</a
	>

	<header class="flex flex-wrap items-end justify-between gap-4">
		<h1 data-testid="esl-admin-user-profile.title" class="text-2xl font-bold text-emerald-900">
			{profile?.name ?? 'Teacher profile'}
		</h1>
		<div class="flex flex-wrap items-end gap-3">
			{#if session.isEslAdmin}
				<div class="flex gap-2 pb-0.5">
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							notice = '';
							availabilityOpen = true;
						}}
						testId="esl-admin-user-profile.availability.trigger"
					>
						<CalendarClock class="size-3.5" aria-hidden="true" />
						Set availability
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							scheduleOpen = true;
						}}
						testId="esl-admin-user-profile.schedule.trigger"
					>
						<CalendarDays class="size-3.5" aria-hidden="true" />
						View weekly schedule
					</Button>
				</div>
			{/if}
			<div class="space-y-1">
				<label class="text-sm font-medium" for="esl-profile-year">School year</label>
				<NativeSelect.Root
					id="esl-profile-year"
					data-testid="esl-admin-user-profile.year"
					value={displayYear}
					onchange={(event) => {
						selectedYear = event.currentTarget.value;
					}}
				>
					{#each profile?.years ?? [fallbackYear] as year (year)}
						<NativeSelect.Option value={year}>{year}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</div>
		</div>
	</header>

	{#if notice}
		<p
			data-testid="esl-admin-user-profile.notice"
			class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
		>
			{notice}
		</p>
	{/if}

	{#if profileQuery.isLoading}
		<p class="text-muted-foreground py-8 text-center" data-testid="esl-admin-user-profile.loading">
			Loading profile…
		</p>
	{:else if notFound || (!profile && loadFailed)}
		<div class="space-y-4">
			<p
				data-testid="esl-admin-user-profile.not-found"
				class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
			>
				Staff member not found.
			</p>
			<a href="/esl/admin/users" class="text-sm font-medium text-emerald-800 hover:underline"
				>← Back to ESL users</a
			>
		</div>
	{:else if loadFailed || !profile}
		<p
			data-testid="esl-admin-user-profile.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			Could not load this profile.
		</p>
	{:else}
		<section
			data-testid="esl-admin-user-profile.header"
			class="flex items-start gap-4 rounded-xl border bg-white p-4 shadow-sm"
		>
			<div class="shrink-0">
				{#if profile.image}
					<img src={profile.image} alt="" class="size-12 rounded-xl object-cover" loading="lazy" />
				{:else}
					<div
						class="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl text-base font-semibold"
					>
						{initials(profile.name)}
					</div>
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-base font-semibold">
					{profile.name}
					{#if isSelf()}
						<span class="text-muted-foreground text-xs font-normal">(you)</span>
					{/if}
				</p>
				<p class="text-muted-foreground text-xs">
					{profile.internationalRole
						? `International · ${profile.internationalRole}`
						: 'No international role'}
				</p>
				<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
					<Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
						{profile.status}
					</Badge>
					<Badge variant="outline" class="text-[10px] {eslBadgeClass(profile.eslRole)}">
						{roleLabel(profile.eslRole)}
					</Badge>
				</div>
				{#if profile.email}
					<a
						href="mailto:{profile.email}"
						data-testid="esl-admin-user-profile.email"
						class="mt-1.5 block truncate text-sm text-emerald-800 hover:underline"
						>{profile.email}</a
					>
				{:else}
					<p
						data-testid="esl-admin-user-profile.email"
						class="text-muted-foreground mt-1.5 text-sm"
					>
						No email on file
					</p>
				{/if}
			</div>
		</section>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<section
				data-testid="esl-admin-user-profile.now"
				class="rounded-xl border bg-white p-4 shadow-sm"
			>
				<h2 class="text-sm font-semibold text-emerald-900">Now</h2>
				{#if isPastYear}
					<p class="text-muted-foreground mt-2 text-sm">
						Current-class status applies to {realYear} — you're viewing {displayYear}.
					</p>
				{:else if currentEntry}
					<p class="mt-2">
						<span
							class="inline-block rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-sm font-medium text-emerald-800"
							>In class now: {entryLabel(currentEntry)}</span
						>
					</p>
				{:else}
					<p class="text-muted-foreground mt-2 text-sm">Not currently in class.</p>
					{#if nextEntry}
						<p class="mt-1 text-sm">Next today: {entryLabel(nextEntry)}</p>
					{:else if !isSchoolDay(taipei.weekday)}
						<p class="mt-1 text-sm">Weekend — no classes.</p>
					{:else}
						<p class="mt-1 text-sm">No more classes today.</p>
					{/if}
				{/if}
			</section>

			<section
				data-testid="esl-admin-user-profile.periods"
				class="rounded-xl border bg-white p-4 shadow-sm"
			>
				<h2 class="text-sm font-semibold text-emerald-900">Teaching load</h2>
				<p class="mt-2 text-2xl font-bold">
					{totalPeriods}
					{totalPeriods === 1 ? 'period' : 'periods'}/week
				</p>
				<p class="text-muted-foreground text-sm">
					{totalPeriods === 0 ? `no classes assigned in ${displayYear}` : `in ${displayYear}`}
				</p>
			</section>
		</div>

		<section data-testid="esl-admin-user-profile.classes" class="space-y-3">
			<h2 class="text-lg font-semibold text-emerald-900">Classes teaching in {displayYear}</h2>
			{#if classes.length === 0}
				<p
					data-testid="esl-admin-user-profile.empty"
					class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
				>
					No classes assigned in {displayYear}.
				</p>
			{:else}
				<ul class="space-y-3">
					{#each classes as cls (cls._id)}
						<li
							data-testid="esl-admin-user-profile.class-row"
							class="rounded-xl border bg-white p-4 shadow-sm"
						>
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<p class="text-sm font-semibold">{cls.name}</p>
								<p class="text-muted-foreground text-xs">
									{cls.meetings.length}
									{cls.meetings.length === 1 ? 'period' : 'periods'}/week
								</p>
							</div>
							<p class="text-muted-foreground mt-0.5 text-xs">
								{cls.cohortLabel} · {cls.type} ·
								<span class={!cls.room ? 'italic' : ''}>{roomLabel(cls.room)}</span>
							</p>
							{#if cls.meetings.length > 0}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each cls.meetings as meeting (meeting.day + meeting.period)}
										<span
											class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900"
											>{eslMeetingLabel(meeting)}</span
										>
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if session.isEslAdmin && profile}
		<SetAvailabilityDialog
			bind:open={availabilityOpen}
			teacherId={profile._id}
			teacherName={profile.name}
			year={displayYear}
			onSaved={handleAvailabilitySaved}
		/>
		<WeeklyScheduleDialog bind:open={scheduleOpen} teacherName={profile.name} year={displayYear} />
	{/if}
</div>
