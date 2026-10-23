import { ESL_ROOM_SUGGESTIONS } from './esl';

export type EslRoomLimit = 'D' | 'E' | 'F' | 'G';

const roomLimits: readonly EslRoomLimit[] = ['D', 'E', 'F', 'G'];

export function isEslRoomLimit(value: unknown): value is EslRoomLimit {
	return roomLimits.some((limit) => limit === value);
}

export function roomsThrough(limit: EslRoomLimit): string[] {
	const lastIndex = ESL_ROOM_SUGGESTIONS.indexOf(`ESL ${limit}`);
	return ESL_ROOM_SUGGESTIONS.slice(0, lastIndex + 1);
}

export function normalizeEslCustomRooms(rooms: string[]): string[] {
	const seen = new Set(ESL_ROOM_SUGGESTIONS.map((room) => room.toLocaleLowerCase()));
	return rooms.map((room) => {
		const normalized = room.trim();
		if (normalized === '') throw new Error('Custom room names cannot be blank.');
		const key = normalized.toLocaleLowerCase();
		if (seen.has(key)) throw new Error(`Room "${normalized}" is already listed.`);
		seen.add(key);
		return normalized;
	});
}
