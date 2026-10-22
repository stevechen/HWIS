/**
 * A reactive stand-in for the `listRoomSuggestions` result the room picker reads.
 *
 * The picker opens *before* the query answers — `open()` is what enables the
 * query — so a test that wants the first-open state has to hold the data in
 * flight and land it later, the way a real picker sees it. `$state` delivers
 * that: a plain mock object is captured once per render and would never update.
 * Runes need the Svelte compiler, hence the `.svelte.ts` extension.
 */
type Suggestions = { department: string[]; homerooms: string[] };

/** The canned answer most tests want, before they vary it. */
const DEFAULT: Suggestions = {
	department: ['ESL A', 'ESL B', 'ESL C', 'ESL D', 'ESL E', 'ESL F', 'ESL G'],
	homerooms: ['J101', 'J103']
};

const store = $state<{ data: Suggestions | undefined }>({ data: DEFAULT });

export const roomSuggestions = {
	/**
	 * Assign `undefined` to reproduce the in-flight first open; reassign a full
	 * answer to reproduce the round-trip landing.
	 */
	get data(): Suggestions | undefined {
		return store.data;
	},
	set data(value: Suggestions | undefined) {
		store.data = value;
	},
	isLoading: false,
	error: null
};

/** Puts the fixture back on the default answer, for test isolation. */
export function resetRoomSuggestions() {
	store.data = DEFAULT;
}

/**
 * Puts the fixture on an explicit answer — the round-trip landing, usually.
 * A separate function rather than a parameter because the in-flight case
 * (`undefined`) would either hit a default parameter or be indistinguishable
 * from a forgotten reset, and both hid the repro once already.
 */
export function landSuggestions(data: Suggestions) {
	store.data = data;
}

/**
 * Reproduces the first open: the query has been enabled by `open()` and has not
 * answered yet. A separate function rather than an optional argument because
 * `resetRoomSuggestions(undefined)` reads like a reset but would store
 * `undefined` as data — the mix-up that hid this bug's repro once already.
 */
export function putSuggestionsInFlight() {
	store.data = undefined;
}
