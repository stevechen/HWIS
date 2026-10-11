<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Upload, AlertCircle, CheckCircle, ExternalLink } from '@lucide/svelte';

	// Route params from SvelteKit
	let { data }: { data: { semesterId: string } } = $props();
	const semesterId = data.semesterId;

	const client = useConvexClient();

	// Fetch semester data
	const semesterQuery = useQuery(api.esl.semesters.get, () => ({ semesterId }));
	const semester = $derived(semesterQuery.data ?? null);

	// Determine calendar year from semester start date
	const calendarYear = $derived(
		semester ? new Date(semester.startDate).getFullYear().toString() : ''
	);

	// Dialog visibility
	let showUploadDialog = $state(false);

	// Upload state
	let uploadFile = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let isUploading = $state(false);
	let uploadResult = $state<{
		insertedCount: number;
		deletedCount: number;
		changedCount: number;
		calendarYear: string;
	} | null>(null);
	let uploadError = $state('');

	async function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		uploadFile = target.files?.[0] || null;
		uploadError = '';
		uploadResult = null;
	}

	async function handleUpload() {
		if (!uploadFile) return;

		isUploading = true;
		uploadError = '';
		uploadResult = null;

		try {
			// Read file as base64
			const base64 = await fileToBase64(uploadFile);

			// Call the action to upload and parse
			const result = await client.action(api.esl.seed.uploadCalendarCsvAction, {
				calendarYear,
				fileBase64: base64,
				fileName: uploadFile.name
			});

			uploadResult = result;
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			isUploading = false;
		}
	}

	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				// Remove data URL prefix if present
				const base64 = result.split(',')[1] || result;
				resolve(base64);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function closeUploadDialog() {
		showUploadDialog = false;
		uploadFile = null;
		uploadResult = null;
		uploadError = '';
		if (fileInput) {
			fileInput.value = '';
		}
	}

	const datasetUrl = 'https://data.gov.tw/dataset/14718';
</script>

<div class="mx-auto w-full max-w-4xl p-8">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 data-testid="esl-semester-admin.title" class="text-2xl font-bold text-emerald-900">
				Semester Setup
			</h1>
			<p class="text-muted-foreground mt-1">
				Configure calendar and holiday data for this semester.
			</p>
		</div>
		<a
			href="/esl/admin"
			data-testid="esl-semester-admin.back-link"
			class="text-sm text-emerald-700 hover:underline"
		>
			← Back to ESL Admin
		</a>
	</div>

	{#if semesterQuery.isLoading}
		<div class="text-muted-foreground py-8 text-center">Loading semester…</div>
	{:else if !semester}
		<div class="py-8 text-center text-red-500">Semester not found</div>
	{:else}
		<div class="space-y-6">
			<!-- Semester Info Card -->
			<div class="rounded-lg border bg-white p-6 shadow-sm">
				<h2 class="mb-4 text-lg font-semibold text-emerald-900">Semester Information</h2>
				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-muted-foreground text-sm">Semester</dt>
						<dd class="font-medium">{semester.year} {semester.term}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-sm">Start Date</dt>
						<dd class="font-medium">{semester.startDate}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-sm">Derived End</dt>
						<dd class="font-medium">{semester.derivedEnd ?? 'Not set (TBD)'}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-sm">Calendar Year</dt>
						<dd class="font-medium">{calendarYear}</dd>
					</div>
				</dl>
			</div>

			<!-- Calendar CSV Upload Section -->
			<div class="rounded-lg border bg-white p-6 shadow-sm">
				<div class="mb-4 flex items-start justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold text-emerald-900">Holiday Calendar CSV Upload</h2>
						<p class="text-muted-foreground mt-1">
							Upload the official government calendar CSV to populate holiday data for {calendarYear}.
						</p>
					</div>
					<a
						href={datasetUrl}
						target="_blank"
						rel="noopener noreferrer"
						data-testid="esl-semester-admin.dataset-link"
						class="flex shrink-0 items-center gap-1 text-sm text-emerald-700 hover:underline"
					>
						<ExternalLink class="size-4" />
						Dataset 14718
					</a>
				</div>

				<div class="rounded-lg border border-dashed border-emerald-200 p-6">
					<div class="space-y-4">
						<div class="text-muted-foreground flex items-center gap-2 text-sm">
							<AlertCircle class="size-4 text-amber-500" />
							<span>
								Expected CSV format (from <a
									href={datasetUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="underline">dataset 14718</a
								>): Headers <code class="bg-muted rounded px-1">西元日期,星期,是否放假,備註</code>,
								Date format <code class="bg-muted rounded px-1">YYYYMMDD</code>,
								<code>是否放假=2</code> indicates an off day (holiday).
							</span>
						</div>

						<div class="space-y-2">
							<Label for="calendar-csv" class="font-medium">Select CSV File</Label>
							<div class="flex items-center gap-4">
								<Button
									variant="outline"
									onclick={() => fileInput?.click()}
									disabled={isUploading}
									aria-label="Choose CSV file"
								>
									<Upload class="mr-2 size-4" />
									{uploadFile ? uploadFile.name : 'Choose File'}
								</Button>
								<input
									bind:this={fileInput}
									id="calendar-csv"
									type="file"
									accept=".csv"
									class="hidden"
									onchange={handleFileSelect}
									disabled={isUploading}
								/>
								{#if uploadFile}
									<span class="text-muted-foreground text-sm">
										{(uploadFile.size / 1024).toFixed(1)} KB
									</span>
								{/if}
							</div>
						</div>

						{#if uploadError}
							<div
								data-testid="esl-semester-admin.upload-error"
								class="flex items-center gap-2 rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
								role="alert"
							>
								<AlertCircle class="size-4 shrink-0" />
								{uploadError}
							</div>
						{/if}

						{#if uploadResult}
							<div
								data-testid="esl-semester-admin.upload-success"
								class="flex items-center gap-2 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
								role="status"
							>
								<CheckCircle class="size-4 shrink-0" />
								<div>
									<p class="font-medium">
										Upload complete for {uploadResult.calendarYear}
									</p>
									<p>
										{uploadResult.insertedCount} rows inserted
										{uploadResult.deletedCount > 0
											? `, ${uploadResult.deletedCount} previous rows replaced`
											: ''}
										({uploadResult.changedCount} total changes)
									</p>
								</div>
							</div>
						{/if}

						<div class="flex justify-end pt-2">
							<Button
								onclick={handleUpload}
								disabled={!uploadFile || isUploading}
								aria-label="Upload calendar CSV"
							>
								{isUploading
									? '<span class="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Uploading...'
									: '<Upload class="mr-2 size-4" />Upload Calendar'}
							</Button>
						</div>
					</div>
				</div>
			</div>

			<!-- Upload Dialog -->
			{#if showUploadDialog}
				<div
					class="fixed inset-0 z-50 flex items-center justify-center p-4"
					role="dialog"
					aria-modal="true"
					aria-labelledby="upload-dialog-title"
				>
					<div
						class="fixed inset-0 bg-black/50"
						onclick={closeUploadDialog}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Escape' && closeUploadDialog()}
					></div>
					<div class="bg-background relative w-full max-w-lg rounded-lg border p-6 shadow-lg">
						<div class="p-6">
							<h2 id="upload-dialog-title" class="text-lg font-semibold">
								Upload Holiday Calendar CSV
							</h2>
							<div class="grid gap-4 py-4">
								<p class="text-muted-foreground text-sm">
									Upload the official calendar CSV for <strong>{calendarYear}</strong>.
									<a
										href={datasetUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="ml-1 text-emerald-700 underline hover:text-emerald-800"
									>
										Download from dataset 14718 <ExternalLink class="inline size-3" />
									</a>
								</p>

								<div class="space-y-2">
									<Label for="dialog-file">CSV File</Label>
									<Button variant="outline" onclick={() => fileInput?.click()}>
										{uploadFile ? uploadFile.name : 'Choose File'}
									</Button>
									<input
										bind:this={fileInput}
										id="dialog-file"
										type="file"
										accept=".csv"
										class="hidden"
										onchange={handleFileSelect}
									/>
								</div>

								{#if uploadError}
									<div
										class="rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
									>
										{uploadError}
									</div>
								{/if}

								{#if uploadResult}
									<div
										class="rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
									>
										<p class="font-medium">Upload complete for {uploadResult.calendarYear}</p>
										<p>
											{uploadResult.insertedCount} rows inserted, {uploadResult.deletedCount} replaced
											({uploadResult.changedCount} total changes)
										</p>
									</div>
								{/if}
							</div>
							<div class="flex justify-end gap-2">
								<Button variant="outline" onclick={closeUploadDialog} disabled={isUploading}
									>Cancel</Button
								>
								<Button onclick={handleUpload} disabled={!uploadFile || isUploading}>
									{isUploading ? 'Uploading...' : 'Upload'}
								</Button>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
