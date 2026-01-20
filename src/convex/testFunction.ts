import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const testCreateEvaluationForStudent = mutation({
	args: {
		studentId: v.string()
	},
	handler: async (ctx, args) => {
		return { success: true, studentId: args.studentId };
	}
});
