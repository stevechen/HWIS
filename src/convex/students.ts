import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query('students')
			.filter((q) => q.eq(q.field('isActive'), true))
			.collect();
	}
});

export const search = query({
	args: { query: v.string() },
	handler: async (ctx, args) => {
		if (!args.query) return [];

		const students = await ctx.db.query('students').collect();
		const terms = args.query
			.split(',')
			.map((t) => t.trim().toLowerCase())
			.filter((t) => t.length > 0);

		if (terms.length === 0) return students.slice(0, 10);

		return students
			.filter((s) =>
				terms.some(
					(term) =>
						s.englishName.toLowerCase().includes(term) ||
						s.chineseName.toLowerCase().includes(term) ||
						s.studentId.toLowerCase().includes(term)
				)
			)
			.slice(0, 10);
	}
});

export const seed = mutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db.query('students').collect();
		if (existing.length > 0) return;

		const students = [
			{
				englishName: 'Alice Smith',
				chineseName: '史艾莉',
				studentId: 'S1001',
				grade: 9,
				isActive: true,
				isGraduated: false
			},
			{
				englishName: 'Bob Jones',
				chineseName: '張博博',
				studentId: 'S1002',
				grade: 10,
				isActive: true,
				isGraduated: false
			},
			{
				englishName: 'Charlie Brown',
				chineseName: '布查理',
				studentId: 'S1003',
				grade: 11,
				isActive: true,
				isGraduated: false
			},
			{
				englishName: 'David Wilson',
				chineseName: '魏大維',
				studentId: 'S1004',
				grade: 12,
				isActive: true,
				isGraduated: false
			},
			{
				englishName: 'Eve Davis',
				chineseName: '戴伊芙',
				studentId: 'S1005',
				grade: 9,
				isActive: true,
				isGraduated: false
			}
		];

		for (const s of students) {
			await ctx.db.insert('students', s);
		}
	}
});
