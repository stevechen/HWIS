<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorContent, Editor as SvelteEditor } from 'svelte-tiptap';
	import type { Editor as CoreEditor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
	import {
		Bold,
		Italic,
		Strikethrough,
		Code,
		Heading,
		List,
		ListOrdered,
		Quote,
		Undo,
		Redo
	} from 'lucide-svelte';

	interface Props {
		open: boolean;
		className: string;
		date: string;
		weekday: string;
		initialContent: string;
		onSave: (content: string) => void;
		onClose: () => void;
	}

	let { open, className, date, weekday, initialContent, onSave, onClose }: Props = $props();

	let editor: SvelteEditor | null = $state(null);
	let content = $state('');
	let hasUnsavedChanges = $state(false);
	let loadedContent = $state('');

	// Load a note only when the dialog's external content changes. The editor's
	// own updates change `content` on every keystroke and must not reset it.
	$effect(() => {
		if (!open || !editor || initialContent === loadedContent) return;
		editor.commands.setContent(initialContent, { emitUpdate: false });
		content = initialContent;
		loadedContent = initialContent;
		hasUnsavedChanges = false;
	});

	const editorExtensions = [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
			link: {
				openOnClick: false,
				HTMLAttributes: {
					class: 'text-emerald-700 underline hover:text-emerald-900'
				}
			}
		}),
		Placeholder.configure({
			placeholder: 'Write your lesson note…'
		}),
		Markdown.configure({
			html: false,
			tightLists: true,
			tightListClass: 'tight'
		})
	];

	onMount(() => {
		editor = new SvelteEditor({
			extensions: editorExtensions,
			content: initialContent,
			onUpdate: ({ editor: updatedEditor }) => {
				updateContent(updatedEditor);
			},
			editable: true
		});
		loadedContent = initialContent;
		return () => {
			editor?.destroy();
			editor = null;
		};
	});

	function formatDate(dateStr: string): string {
		const [year, month, day] = dateStr.split('-').map(Number);
		const d = new Date(year, month - 1, day);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function handleSave() {
		if (!editor) {
			console.error('Editor is null');
			return;
		}
		const text = editor.getText();

		// Use getMarkdown() from tiptap-markdown storage.
		const markdownStorage = (editor.storage as { markdown?: unknown }).markdown;
		const markdown = isMarkdownStorage(markdownStorage) ? markdownStorage.getMarkdown() : text;
		onSave(typeof markdown === 'string' ? markdown : text);
		hasUnsavedChanges = false;
	}

	function handleClose() {
		if (hasUnsavedChanges) {
			if (!confirm('You have unsaved changes. Discard them?')) {
				return;
			}
		}
		onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			handleSave();
		}
		if (event.key === 'Escape') {
			handleClose();
		}
	}

	function isMarkdownStorage(value: unknown): value is MarkdownStorage {
		if (typeof value !== 'object' || value === null || !('getMarkdown' in value)) {
			return false;
		}
		return typeof value.getMarkdown === 'function';
	}

	function updateContent(editorInstance: CoreEditor) {
		const markdownStorage = (editorInstance.storage as { markdown?: unknown }).markdown;
		const newContent = isMarkdownStorage(markdownStorage)
			? markdownStorage.getMarkdown()
			: editorInstance.getText();
		if (newContent !== content) {
			content = newContent;
			hasUnsavedChanges = true;
		}
	}

	// Toolbar actions
	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}
	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}
	function toggleStrike() {
		editor?.chain().focus().toggleStrike().run();
	}
	function toggleCode() {
		editor?.chain().focus().toggleCode().run();
	}
	function toggleHeading(level: 1 | 2 | 3) {
		editor?.chain().focus().toggleHeading({ level }).run();
	}
	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}
	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}
	function toggleBlockquote() {
		editor?.chain().focus().toggleBlockquote().run();
	}
	function addLink() {
		const url = prompt('Enter URL:');
		if (url && editor) {
			editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
		}
	}
	function undo() {
		editor?.chain().focus().undo().run();
	}
	function redo() {
		editor?.chain().focus().redo().run();
	}

	// Focus editor when dialog opens
	$effect(() => {
		if (open && editor) {
			// Use setTimeout to ensure the editor is fully rendered and ready to be focused
			setTimeout(() => {
				if (editor) {
					editor.chain().focus().run();
				}
			}, 50);
		}
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		onclick={handleClose}
		role="dialog"
		aria-modal="true"
		aria-labelledby="dialog-title"
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<div
			class="animate-slide-up flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
			onclick={(e) => e.stopPropagation()}
			role="presentation"
		>
			<!-- Header -->
			<header class="flex items-center justify-between border-b border-stone-200 px-6 py-4">
				<div>
					<h2 id="dialog-title" class="text-lg font-semibold text-stone-900">Lesson Note</h2>
					<div class="mt-1 flex items-center gap-3 text-sm text-stone-500">
						<span class="font-medium text-stone-700">{className}</span>
						<span aria-hidden="true">·</span>
						<span>{formatDate(date)}</span>
						<span aria-hidden="true">·</span>
						<span>{weekday}</span>
					</div>
				</div>
				<button
					class="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
					onclick={handleClose}
					aria-label="Close dialog"
				>
					<svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</header>

			<!-- Toolbar -->
			<div class="flex flex-wrap gap-1 border-b border-stone-100 bg-stone-50/50 px-4 py-2">
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900 disabled:opacity-50"
					onclick={undo}
					aria-label="Undo (⌘Z)"
					title="Undo (⌘Z)"
				>
					<Undo class="size-4" />
				</button>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900 disabled:opacity-50"
					onclick={redo}
					aria-label="Redo (⌘⇧Z)"
					title="Redo (⌘⇧Z)"
				>
					<Redo class="size-4" />
				</button>
				<div class="my-0.5 h-6 w-px bg-stone-200" aria-hidden="true"></div>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={toggleBold}
					aria-label="Bold (⌘B)"
					title="Bold (⌘B)"
				>
					<Bold class="size-4" />
				</button>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={toggleItalic}
					aria-label="Italic (⌘I)"
					title="Italic (⌘I)"
				>
					<Italic class="size-4" />
				</button>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={toggleStrike}
					title="Strikethrough"
				>
					<Strikethrough class="size-4" />
				</button>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={toggleCode}
					title="Inline code"
				>
					<Code class="size-4" />
				</button>
				<div class="my-0.5 h-6 w-px bg-stone-200" aria-hidden="true"></div>
				<select
					class="rounded border border-stone-200 bg-white px-2 py-1 text-sm text-stone-700 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
					onchange={(e) => {
						const level = Number(e.currentTarget.value);
						if (level) toggleHeading(level as 1 | 2 | 3);
						e.currentTarget.value = '';
					}}
					title="Heading"
				>
					<option value="" disabled selected>Heading</option>
					<option value="1">Heading 1</option>
					<option value="2">Heading 2</option>
					<option value="3">Heading 3</option>
				</select>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={toggleBulletList}
					title="Bullet list"
				>
					<List class="size-4" />
				</button>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={toggleOrderedList}
					title="Numbered list"
				>
					<ListOrdered class="size-4" />
				</button>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={toggleBlockquote}
					title="Quote"
				>
					<Quote class="size-4" />
				</button>
				<button
					type="button"
					class="rounded border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
					onclick={addLink}
					title="Add link"
				>
					<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
						/>
					</svg>
				</button>
			</div>

			<!-- Editor -->
			<div class="flex-1 overflow-hidden p-4">
				{#if editor}
					<EditorContent
						{editor}
						class="prose min-h-[300px] max-w-none prose-stone focus:outline-none"
					/>
				{/if}
			</div>

			<!-- Footer -->
			<footer class="flex justify-end gap-3 border-t border-stone-200 bg-stone-50/50 px-6 py-4">
				<button
					class="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
					onclick={handleClose}
				>
					Cancel
				</button>
				<button
					class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
					onclick={handleSave}
				>
					Save Note
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	/* TipTap renders the editor DOM inside EditorContent; these selectors must
	   be global because Svelte cannot see that generated markup at compile time. */
	:global(.tiptap) {
		outline: none;
	}

	/* Placeholder styling */
	:global(.tiptap p.is-editor-empty:first-child::before) {
		color: #a8a29e;
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}

	/* Basic prose styles for rendered content */
	:global(.prose :where(p):not(:where([class~='not-prose'] *))) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}

	:global(.prose :where(ul):not(:where([class~='not-prose'] *))) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}

	:global(.prose :where(ol):not(:where([class~='not-prose'] *))) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}

	:global(.prose :where(h1):not(:where([class~='not-prose'] *))) {
		margin-top: 0.8em;
		margin-bottom: 0.4em;
	}

	:global(.prose :where(h2):not(:where([class~='not-prose'] *))) {
		margin-top: 0.7em;
		margin-bottom: 0.35em;
	}

	:global(.prose :where(h3):not(:where([class~='not-prose'] *))) {
		margin-top: 0.6em;
		margin-bottom: 0.3em;
	}

	:global(.prose :where(blockquote):not(:where([class~='not-prose'] *))) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
		padding-left: 1em;
		border-left: 4px solid #e7e5e4; /* stone-300 */
		color: #78716c; /* stone-500 */
	}

	:global(.prose :where(a):not(:where([class~='not-prose'] *))) {
		color: #047857; /* emerald-700 */
		text-decoration: underline;
	}

	:global(.prose :where(a):not(:where([class~='not-prose'] *)):hover) {
		color: #065f46; /* emerald-900 */
	}
</style>
