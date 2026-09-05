import { toPng } from 'html-to-image';

export type CaptureOptions = {
	/** Offscreen render size. Defaults to 1280×720. */
	width?: number;
	height?: number;
	/** Downscale factor for the stored thumbnail. Defaults to 0.25 (≈320px wide). */
	pixelRatio?: number;
	/** How long to wait for the board to load and settle, in ms. Defaults to 2500. */
	settleMs?: number;
};

/**
 * Renders a same-origin board route in a hidden iframe and captures it as a
 * PNG data URL for the admin preview slot.
 *
 * html-to-image serializes the DOM into SVG foreignObject, so the browser's
 * own engine paints it — modern CSS (oklch, color-mix, backdrop-blur) works,
 * unlike html2canvas which re-implements painting and throws on Tailwind v4
 * colors. Throws when the board fails to load or capture is blocked.
 */
export async function captureBoardThumbnail(path: string, opts?: CaptureOptions): Promise<string> {
	const width = opts?.width ?? 1280;
	const height = opts?.height ?? 720;
	const pixelRatio = opts?.pixelRatio ?? 0.25;
	const settleMs = opts?.settleMs ?? 2500;

	const iframe = document.createElement('iframe');
	iframe.setAttribute('aria-hidden', 'true');
	iframe.tabIndex = -1;
	iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;border:0;visibility:hidden;`;
	document.body.appendChild(iframe);

	try {
		await new Promise<void>((resolve, reject) => {
			const timer = window.setTimeout(
				() => reject(new Error('Thumbnail capture timed out')),
				25000
			);
			iframe.onload = () => {
				window.clearTimeout(timer);
				resolve();
			};
			iframe.onerror = () => {
				window.clearTimeout(timer);
				reject(new Error('Thumbnail capture failed to load the board'));
			};
			iframe.src = path;
		});
		// Let Convex data arrive and the first paint settle before capturing.
		await new Promise((r) => window.setTimeout(r, settleMs));
		const doc = iframe.contentDocument;
		if (!doc?.documentElement) throw new Error('Thumbnail capture was blocked');
		return await toPng(doc.documentElement, { pixelRatio, cacheBust: true });
	} finally {
		iframe.remove();
	}
}
