/**
 * The sentence a refused Convex mutation failed with, without the transport.
 *
 * A server refusal arrives on the client wrapped in the transport's own
 * packaging — `[CONVEX M(esl/classes:assignTeacher)] [Request ID: …] Server
 * Error`, then `Uncaught Error: <the message>`, then the client stack and
 * `Called by client`. Showing that verbatim in a notice reads as a crash
 * report rather than as the gate's reason, so this unwraps it to the message
 * the server threw.
 *
 * Anything that is not a wrapped server error passes through untouched: an
 * error the client raised itself has no transport to strip.
 */
export function humanConvexErrorMessage(error: unknown): string {
	if (!(error instanceof Error)) return 'Something went wrong';
	const marker = 'Uncaught Error: ';
	const start = error.message.indexOf(marker);
	if (start === -1) return error.message;
	const rest = error.message.slice(start + marker.length);
	// The client stack footer: ` at <name> (…)` frames, then `Called by client`.
	// The frame pattern needs the paren, so a message naming "this time" or
	// "that day" cannot match it.
	const stackAt = rest.search(/ at [A-Za-z_$][\w$]* \(/);
	const withoutStack = stackAt === -1 ? rest : rest.slice(0, stackAt);
	return withoutStack.replace(/\s*Called by client\s*$/, '').trim() || error.message;
}
