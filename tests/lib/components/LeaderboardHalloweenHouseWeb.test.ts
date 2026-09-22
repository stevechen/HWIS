import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
// The card grid, the `fixed` spider overlay and every clamp() live in Tailwind
// utilities from the root stylesheet, so pull it in before measuring geometry.
import '$src/app.css';
import HalloweenShell from '../../mocks/MockHalloweenShell.svelte';

const CATEGORIES = [
	'Responsibility',
	'Excellence',
	'Service',
	'Persistence',
	'Enthusiasm',
	'Collaboration',
	'Trustworthiness'
];

// Deliberately in HOUSE order with the ranks shuffled, so the 1st-place card
// lands in the third column: anything that assumes the leader is the first card
// (or that the cards are ranked) fails here.
const HOUSES = [
	{ house: 'Heracles', rank: 2, totalPoints: 90 },
	{ house: 'Wukong', rank: 3, totalPoints: 80 },
	{ house: 'Ixbalam', rank: 1, totalPoints: 120 },
	{ house: 'Setna', rank: 4, totalPoints: 70 }
].map((h) => ({
	...h,
	pointsByCategory: { Responsibility: h.totalPoints / 2, Excellence: h.totalPoints / 3 },
	topContributors: [{ studentId: `${h.house}-1`, englishName: 'Alice', totalPoints: 12 }]
}));

const LEADER_INDEX = HOUSES.findIndex((h) => h.rank === 1);
const ANY_CARD_POINTS = String(HOUSES[0].totalPoints);

function box(el: Element) {
	return el.getBoundingClientRect();
}

/** Chart user units → screen pixels, so one assertion can mix both frames. */
function chartMapper(chart: SVGSVGElement) {
	const ctm = chart.getScreenCTM();
	if (!ctm) throw new Error('web chart is not rendered');
	return (x: number, y: number) => {
		const p = chart.createSVGPoint();
		p.x = x;
		p.y = y;
		return p.matrixTransform(ctm);
	};
}

/** Numbers out of a path's `d`, in order. */
function pathNumbers(el: Element): number[] {
	return (el.getAttribute('d') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? [];
}

const HUB = { x: 100, y: 100 };
const SPOKE_TIP_RADIUS = 520;

/** The web's radial strands, in `chartCats` order. */
function spokePaths(chart: SVGSVGElement) {
	return Array.from(chart.querySelectorAll('path')).filter((p) =>
		(p.getAttribute('d') ?? '').startsWith('M 100 100')
	);
}

/** The capture-silk segments — every `M` point of these is a ring node. */
function ringSegments(chart: SVGSVGElement) {
	return Array.from(chart.querySelectorAll('path[stroke="#a5b4fc"]')).filter(
		(p) => !(p.getAttribute('d') ?? '').startsWith('M 100 100')
	);
}

/**
 * How far a point sits off the ray that leaves the hub at `angle`, in chart
 * user units. Zero means the point is exactly on that radial.
 */
function offRay(point: { x: number; y: number }, angle: number): number {
	// Ray direction in SVG space (y grows downward).
	const ux = Math.cos(angle);
	const uy = -Math.sin(angle);
	const vx = point.x - HUB.x;
	const vy = point.y - HUB.y;
	return Math.abs(vx * uy - vy * ux);
}

function webAngleFor(i: number, n: number): number {
	return Math.PI / 2 - (2 * Math.PI * i) / n;
}

/** Freeze the page so the drop is measured on a known keyframe instead of
 *  whatever frame the wall clock happens to be on. */
async function seekAnimations(ms: number) {
	for (const animation of document.getAnimations()) {
		animation.pause();
		animation.currentTime = ms;
	}
	await new Promise((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
	);
}

async function setup() {
	// Mounted inside the same height chain the real board uses. Rendering the
	// theme standalone lets `h-full` collapse to content height: the cards come
	// out short, the chart letterboxes differently, and geometry measured that
	// way does not describe the wall display this board is built for.
	render(HalloweenShell, { houses: HOUSES, categories: CATEGORIES });
	await expect.element(page.getByText(ANY_CARD_POINTS).first()).toBeVisible();

	const layer = document.querySelector<HTMLElement>('.spider-layer');
	const thread = document.querySelector<HTMLElement>('.spider-thread');
	const drop = document.querySelector<HTMLElement>('.spider-drop');
	const svg = drop?.querySelector<SVGSVGElement>('svg');
	const cards = Array.from(document.querySelectorAll<HTMLElement>('article'));

	if (!layer || !thread || !drop || !svg || cards.length !== HOUSES.length) {
		throw new Error('halloween board markup changed: expected a spider overlay and four cards');
	}

	// The overlay publishes its measurements through --silk; wait for the effect
	// to land so the assertions describe the laid-out board instead of the 0px
	// paint that happens before the cards have been measured.
	await expect.poll(() => Number.parseFloat(getComputedStyle(thread).height)).toBeGreaterThan(0);

	return { layer, thread, drop, svg, cards, leader: cards[LEADER_INDEX] };
}

describe('LeaderboardHalloweenHouseWeb', () => {
	it('anchors the silk to the page ceiling and pays it out to the 1st-place card', async () => {
		// Measure at the wall-display size the board is designed for.
		const defaultViewport = { width: window.innerWidth, height: window.innerHeight };
		await page.viewport(1920, 1080);

		const { layer, thread, svg, cards, leader } = await setup();

		// The thread hangs from the top of the PAGE, not from the card: the overlay
		// is a viewport-fixed box, so its top edge is 0 wherever the cards sit.
		expect(box(layer).top).toBe(0);
		expect(box(thread).top).toBe(0);

		// The silk is exactly as long as the distance from that ceiling to the
		// leader's card, so the spider lands on the card instead of short of it.
		const silkLength = Number.parseFloat(getComputedStyle(thread).height);
		expect(Math.abs(silkLength - box(leader).top)).toBeLessThanOrEqual(2);

		// It hangs in the leader's column — a house-order column, not the first —
		// nudged right by exactly one spider width so the leader's crest stays clear.
		const leaderBox = box(leader);
		const threadX = box(thread).left + box(thread).width / 2;
		const leaderCentre = leaderBox.left + leaderBox.width / 2;
		expect(Math.abs(threadX - (leaderCentre + box(svg).width))).toBeLessThanOrEqual(2);
		const firstCardX = box(cards[0]).left + box(cards[0]).width / 2;
		expect(Math.abs(threadX - firstCardX)).toBeGreaterThan(20);

		await page.viewport(defaultViewport.width, defaultViewport.height);
	});

	it('drops the spider from the page top onto the leader and leaves it hanging on the silk', async () => {
		const defaultViewport = { width: window.innerWidth, height: window.innerHeight };
		await page.viewport(1920, 1080);

		const { thread, drop, svg, leader } = await setup();
		// The SVG is drawn abdomen-up, so its top edge sits `--body` above the
		// spinnerets the silk runs into: y=108 of a 180-tall viewBox, i.e. the top
		// of the abdomen ellipse. This is the point that must stay glued to the
		// thread's free end — the "detached spider" bug was this offset drifting.
		const spinneretY = () => box(svg).top + box(svg).height * (108 / 180);

		await seekAnimations(0);
		const silkLength = Number.parseFloat(getComputedStyle(thread).height);
		// Retracted to a 5% stub of silk, with the spider coiled up at the ceiling
		// and well clear of the card it is about to fall on.
		expect(Math.abs(new DOMMatrix(getComputedStyle(thread).transform).d)).toBeLessThan(0.1);
		expect(spinneretY()).toBeLessThanOrEqual(silkLength * 0.05 + 2);
		expect(spinneretY()).toBeLessThan(box(leader).top - 40);

		await seekAnimations(8000); // mid-drop: 32%-62% of the cycle = dangling
		const leaderBox = box(leader);
		// Landed: the abdomen rests on the card's top edge…
		expect(Math.abs(spinneretY() - leaderBox.top)).toBeLessThanOrEqual(2);
		// …still tied to the silk (the thread end is exactly where it landed).
		expect(Math.abs(spinneretY() - box(thread).bottom)).toBeLessThanOrEqual(2);
		// …and directly over the leader, never over a neighbour.
		const dropX = box(drop).left + box(drop).width / 2;
		expect(dropX).toBeGreaterThan(leaderBox.left);
		expect(dropX).toBeLessThan(leaderBox.right);

		await page.viewport(defaultViewport.width, defaultViewport.height);
	});

	it('runs every web axis out to the edge of its house card, on its true axis', async () => {
		const defaultViewport = { width: window.innerWidth, height: window.innerHeight };
		await page.viewport(1920, 1080);

		const { cards } = await setup();

		for (const card of cards) {
			const chart = card.querySelector<SVGSVGElement>('svg[role="img"]');
			if (!chart) throw new Error('halloween board markup changed: expected a web chart');

			const spokes = spokePaths(chart);
			expect(spokes).toHaveLength(CATEGORIES.length);

			const toScreen = chartMapper(chart);
			const chartBox = box(chart);
			const cardBox = box(card);
			const hub = toScreen(HUB.x, HUB.y);
			const n = CATEGORIES.length;

			for (const [i, spoke] of spokes.entries()) {
				const d = spoke.getAttribute('d') ?? '';
				const points = pathNumbers(spoke);
				const tip = { x: points[points.length - 2], y: points[points.length - 1] };

				// A radial is dead straight from the hub and makes no extra stop:
				// `L` to the single tip, no quadratics. A bowed radial leans off
				// its own angle, which is what dragged the ring nodes and the
				// legend labels a few pixels away from the strand they belong to.
				expect(d).toMatch(/^M 100 100 L -?[\d.]+ -?[\d.]+$/);

				// Every axis is exactly as long as every other, so the seven tips
				// sit on one circle: the axes are evenly placed, and no axis is
				// short of the frame while its neighbour reaches.
				expect(Math.hypot(tip.x - HUB.x, tip.y - HUB.y)).toBeCloseTo(SPOKE_TIP_RADIUS, 1);

				// The tip points at its own axis, not a neighbouring one.
				expect(offRay(tip, webAngleFor(i, n))).toBeLessThan(0.5);

				const screen = toScreen(tip.x, tip.y);

				// Each strand is clipped by the card, so it has to leave the
				// chart's own box — no dead stop at the rim, which is what left a
				// gap under the card's top edge…
				expect(
					screen.x < chartBox.left - 1 ||
						screen.x > chartBox.right + 1 ||
						screen.y < chartBox.top - 1 ||
						screen.y > chartBox.bottom + 1
				).toBe(true);
				// …and reach at least the card frame on the side it points at.
				expect(
					screen.x <= cardBox.left + 1 ||
						screen.x >= cardBox.right - 1 ||
						screen.y <= cardBox.top + 1 ||
						screen.y >= cardBox.bottom - 1
				).toBe(true);
			}

			// The upper axes are the ones that used to fall short: the chart
			// letterboxes inside a card body that is taller than it is wide, so
			// the hub sits well below the card's top edge. Both must clear it.
			const upward = spokes.filter((s) => {
				const p = pathNumbers(s);
				return p[p.length - 1] < HUB.y;
			});
			expect(upward.length).toBeGreaterThanOrEqual(2);
			for (const spoke of upward) {
				const p = pathNumbers(spoke);
				const screen = toScreen(p[p.length - 2], p[p.length - 1]);
				expect(screen.y).toBeLessThan(cardBox.top);
			}
			// The hub really is below the card top, so the assertion above is
			// exercising the letterboxed case rather than a trivially short card.
			expect(hub.y).toBeGreaterThan(cardBox.top + 60);

			// Ring nodes and legend labels are placed on the axis angle; with
			// straight radials they land on the strand itself. Ring segments are
			// emitted per ring, one per axis in order, so a node's own axis is
			// known by position — checking against that axis (not merely the
			// nearest one) is what catches a node drifting to a neighbour.
			const rings = ringSegments(chart);
			expect(rings).toHaveLength(4 * n);
			for (const [index, segment] of rings.entries()) {
				const node = pathNumbers(segment);
				expect(
					offRay({ x: node[0], y: node[1] }, webAngleFor(index % n, n)),
					`ring node ${index} is off its axis`
				).toBeLessThan(0.5);
			}

			const labels = Array.from(chart.querySelectorAll('text'));
			expect(labels).toHaveLength(n);
			for (const [i, label] of labels.entries()) {
				const point = {
					x: Number(label.getAttribute('x')),
					y: Number(label.getAttribute('y'))
				};
				expect(offRay(point, webAngleFor(i, n)), `legend label ${i} is off its axis`).toBeLessThan(
					0.5
				);
			}

			// The data polygon's vertices sit on the axes too, so a house's own
			// shape reads against the strands instead of across them. Each `Q`
			// carries its control point first and the vertex second, so the
			// vertices are the even-numbered pairs after the `M` start point.
			const polygon = Array.from(chart.querySelectorAll('path')).find(
				(p) => !spokes.includes(p) && !rings.includes(p)
			);
			if (!polygon) throw new Error('halloween board markup changed: expected a data polygon');
			const dps = pathNumbers(polygon);
			expect(dps).toHaveLength(2 + 4 * n);
			const vertices = [{ x: dps[0], y: dps[1] }];
			for (let k = 0; k < n; k++) {
				const endpoint = 2 + k * 4 + 2;
				vertices.push({ x: dps[endpoint], y: dps[endpoint + 1] });
			}
			// `n` vertices plus the closing one, which returns to the start.
			expect(vertices).toHaveLength(n + 1);
			expect(vertices[n].x).toBeCloseTo(vertices[0].x, 1);
			expect(vertices[n].y).toBeCloseTo(vertices[0].y, 1);
			for (let i = 0; i < n; i++) {
				expect(
					offRay(vertices[i], webAngleFor(i, n)),
					`data polygon node ${i} is off its axis`
				).toBeLessThan(0.5);
			}
		}

		await page.viewport(defaultViewport.width, defaultViewport.height);
	});
});
