import { describe, it, expect } from 'vitest';
import { convexTest, modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

describe('House Events CRUD', () => {
	it('list returns events with date ranges', async () => {
		const t = convexTest(schema, modules);

		await t.mutation(api.houseEvents.create, {
			title: 'Sports Day',
			startDate: Date.UTC(2024, 0, 1),
			endDate: Date.UTC(2024, 0, 15),
			housePoints: { Heracles: 10, Wukong: 5 }
		});

		const events = await t.query(api.houseEvents.list, {});

		expect(events).toHaveLength(1);
		expect(events[0].title).toBe('Sports Day');
		expect(events[0].startDate).toBe(Date.UTC(2024, 0, 1));
		expect(events[0].endDate).toBe(Date.UTC(2024, 0, 15));
		expect(events[0].housePoints).toBeDefined();
	});

	it('create creates event with house points', async () => {
		const t = convexTest(schema, modules);

		const id = await t.mutation(api.houseEvents.create, {
			title: 'Test Event',
			startDate: Date.UTC(2024, 1, 1),
			endDate: Date.UTC(2024, 1, 10),
			housePoints: { Heracles: 15, Ixbalam: 20, Setna: 5 }
		});

		const event = await t.query(api.houseEvents.getById, { id });

		expect(event).not.toBeNull();
		expect(event!.title).toBe('Test Event');
		expect(event!.housePoints).toBeDefined();
		expect(event!.housePoints!.Heracles).toBe(15);
		expect(event!.housePoints!.Ixbalam).toBe(20);
		expect(event!.housePoints!.Setna).toBe(5);
	});

	it('update updates event', async () => {
		const t = convexTest(schema, modules);

		const id = await t.mutation(api.houseEvents.create, {
			title: 'Original Event',
			startDate: Date.UTC(2024, 0, 1),
			endDate: Date.UTC(2024, 0, 10),
			housePoints: { Heracles: 5 }
		});

		await t.mutation(api.houseEvents.update, {
			id,
			title: 'Updated Event',
			housePoints: { Heracles: 20, Wukong: 10 }
		});

		const event = await t.query(api.houseEvents.getById, { id });

		expect(event!.title).toBe('Updated Event');
		expect(event!.housePoints!.Heracles).toBe(20);
		expect(event!.housePoints!.Wukong).toBe(10);
	});

	it('remove deletes event', async () => {
		const t = convexTest(schema, modules);

		const id = await t.mutation(api.houseEvents.create, {
			title: 'To Delete',
			startDate: Date.UTC(2024, 0, 1),
			endDate: Date.UTC(2024, 0, 10)
		});

		await t.mutation(api.houseEvents.remove, { id });

		const event = await t.query(api.houseEvents.getById, { id });
		expect(event).toBeNull();
	});

	it('validation: end after start on create', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.houseEvents.create, {
				title: 'Wrong Order',
				startDate: Date.UTC(2024, 1, 1),
				endDate: Date.UTC(2024, 0, 1)
			});
		}).rejects.toThrow('End date must be on or after the start date');
	});

	it('house points optional', async () => {
		const t = convexTest(schema, modules);

		const id = await t.mutation(api.houseEvents.create, {
			title: 'No Points',
			startDate: Date.UTC(2024, 0, 1),
			endDate: Date.UTC(2024, 0, 10)
			// No housePoints
		});

		const event = await t.query(api.houseEvents.getById, { id });

		expect(event).not.toBeNull();
		expect(event!.housePoints).toBeUndefined();
	});

	it('update validation: end after start', async () => {
		const t = convexTest(schema, modules);

		const id = await t.mutation(api.houseEvents.create, {
			title: 'Original',
			startDate: Date.UTC(2024, 0, 1),
			endDate: Date.UTC(2024, 0, 10)
		});

		await expect(async () => {
			await t.mutation(api.houseEvents.update, {
				id,
				startDate: Date.UTC(2024, 1, 1),
				endDate: Date.UTC(2024, 0, 1)
			});
		}).rejects.toThrow('End date must be on or after the start date');
	});

	it('event not found error on update', async () => {
		const t = convexTest(schema, modules);

		// Use a valid ID format but non-existent
		const fakeId = ('evt_' + Math.random().toString(36).substring(2, 15)) as Id<'house_events'>;

		await expect(async () => {
			await t.mutation(api.houseEvents.update, {
				id: fakeId,
				title: 'Updated'
			});
		}).rejects.toThrow();
	});

	it('event not found error on delete', async () => {
		const t = convexTest(schema, modules);

		const fakeId = ('evt_' + Math.random().toString(36).substring(2, 15)) as Id<'house_events'>;

		await expect(async () => {
			await t.mutation(api.houseEvents.remove, {
				id: fakeId
			});
		}).rejects.toThrow();
	});
});
