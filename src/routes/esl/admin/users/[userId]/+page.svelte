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

<div class="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
	<a
		href="/esl/admin/users"
		data-testid="esl-admin-user-profile.back"
		class="text-sm font-medium text-emerald-800 hover:underline">← Back to ESL users</a
	>

	<header class="flex flex-wrap items-end justify-between gap-4">
		<h1 data-testid="esl-admin-user-profile.title" class="text-2xl font-bold text-emerald-900">
			{profile?.name ?? 'Teacher profile'}
			{#if profile && isSelf()}
				<span class="text-muted-foreground text-sm font-normal">(you)</span>
			{/if}
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
		<div class="flex flex-col gap-4 sm:flex-row">
			<section
				data-testid="esl-admin-user-profile.header"
				class="flex flex-1 items-start gap-4 rounded-xl border bg-white p-3 shadow-sm"
			>
				<div class="shrink-0">
					{#if profile.image}
						<img
							src={profile.image}
							alt=""
							class="size-12 rounded-xl object-cover"
							loading="lazy"
						/>
					{:else}
						<div
							class="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl text-base font-semibold"
						>
							{initials(profile.name)}
						</div>
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-muted-foreground text-xs">
						{profile.internationalRole
							? `International · ${profile.internationalRole}`
							: 'No international role'}
						<span class="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
							<Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
								{profile.status}
							</Badge>
							<Badge variant="outline" class="text-[10px] {eslBadgeClass(profile.eslRole)}">
								{roleLabel(profile.eslRole)}
							</Badge>
						</span>
					</p>
					{#if profile.email}
						<a
							href="mailto:{profile.email}"
							data-testid="esl-admin-user-profile.email"
							class="mt-1 block truncate text-sm text-emerald-800 hover:underline"
							>{profile.email}</a
						>
					{:else}
						<p
							data-testid="esl-admin-user-profile.email"
							class="text-muted-foreground mt-1 text-sm"
						>
							No email on file
						</p>
					{/if}
				</div>
			</section>

			<section
				data-testid="esl-admin-user-profile.periods"
				class="rounded-xl border bg-white p-3 shadow-sm sm:w-52 sm:shrink-0"
			>
				<h2 class="text-sm font-semibold text-emerald-900">Teaching load</h2>
				<p class="mt-1.5 text-lg font-bold">
					{totalPeriods}
					{totalPeriods === 1 ? 'period' : 'periods'}/week
					{#if totalPeriods === 0}
						<span class="text-muted-foreground text-xs font-normal">· no classes assigned</span>
					{/if}
					{#if displayYear !== realYear}
						<span class="text-muted-foreground text-xs font-normal">· {displayYear}</span>
					{/if}
				</p>
			</section>
		</div>

		<p data-testid="esl-admin-user-profile.now" class="flex flex-wrap items-center gap-x-2 text-sm">
			{#if isPastYear}
				<span class="text-muted-foreground"
					>Current-class status applies to {realYear} — you're viewing {displayYear}.</span
				>
			{:else if currentEntry}
				<span aria-hidden="true" class="size-2 shrink-0 rounded-full bg-emerald-500"></span>
				<span
					><span class="font-medium">In class now</span> — {currentEntry.cls.name} ·
					{roomLabel(currentEntry.cls.room)}</span
				>
			{:else}
				<span aria-hidden="true" class="size-2 shrink-0 rounded-full bg-gray-300"></span>
				<span><span class="font-medium">Not currently in class.</span></span>
				{#if nextEntry}
					<span class="text-muted-foreground">Next: {entryLabel(nextEntry)}</span>
				{:else if !isSchoolDay(taipei.weekday)}
					<span class="text-muted-foreground">Weekend — no classes.</span>
				{:else}
					<span class="text-muted-foreground">No more classes today.</span>
				{/if}
			{/if}
		</p>

		<section data-testid="esl-admin-user-profile.classes" class="space-y-2">
			<h2 class="text-sm font-semibold text-emerald-900">Classes teaching in {displayYear}</h2>
			{#if classes.length === 0}
				<p
					data-testid="esl-admin-user-profile.empty"
					class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
				>
					No classes assigned in {displayYear}.
				</p>
			{:else}
				<ul class="flex flex-wrap gap-2">
					{#each classes as cls (cls._id)}
						<li
							data-testid="esl-admin-user-profile.class-row"
							class="min-w-0 flex-1 basis-full rounded-xl border bg-white p-3 shadow-sm sm:min-w-60 sm:basis-72"
						>
							<p class="truncate text-sm">
								<span class="font-semibold">{cls.name}</span>
								<span class="text-muted-foreground">
									· <span class={!cls.room ? 'italic' : ''}>{roomLabel(cls.room)}</span></span
								>
							</p>
							<div class="mt-1 flex flex-wrap gap-1">
								{#each cls.meetings as meeting (meeting.day + meeting.period)}
									<span
										class="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[11px] text-emerald-900"
										>{eslMeetingLabel(meeting)}</span
									>
								{/each}
							</div>
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
		<WeeklyScheduleDialog
			bind:open={scheduleOpen}
			teacherId={profile._id}
			teacherName={profile.name}
			year={displayYear}
			classes={profile.classes}
		/>
	{/if}
</div>
