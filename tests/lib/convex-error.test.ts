import { describe, it, expect } from 'vitest';
import { humanConvexErrorMessage } from '$lib/convex-error';

describe('humanConvexErrorMessage', () => {
	it('unwraps a server refusal to the message the gate threw', () => {
		const error = new Error(
			'[CONVEX M(esl/classes:assignTeacher)] [Request ID: 65a20a6c50aeecd1] Server Error ' +
				'Uncaught Error: This schedule cannot be saved:\n' +
				'  • G7 Elementary 1 CLIL has the same teacher; the two classes need different ones.\n' +
				'  • G7 Pre-Elementary 1 CLIL has the same teacher at this time, in a different room. ' +
				'at gateTeacherChange (../../src/convex/esl/classes.ts:222:0) ' +
				'at async handler (../../src/convex/esl/classes.ts:229:10) Called by client'
		);

		expect(humanConvexErrorMessage(error)).toBe(
			'This schedule cannot be saved:\n' +
				'  • G7 Elementary 1 CLIL has the same teacher; the two classes need different ones.\n' +
				'  • G7 Pre-Elementary 1 CLIL has the same teacher at this time, in a different room.'
		);
	});

	it('leaves a client-side error untouched', () => {
		expect(humanConvexErrorMessage(new Error('Network unreachable'))).toBe('Network unreachable');
	});

	it('falls back for a refusal with no extractable message', () => {
		expect(humanConvexErrorMessage('boom')).toBe('Something went wrong');
		expect(humanConvexErrorMessage(new Error('Uncaught Error: '))).toBe('Uncaught Error: ');
	});
});
