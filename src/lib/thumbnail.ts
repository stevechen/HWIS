import { toPng, toJpeg } from 'html-to-image';

export type CaptureOptions = {
	/** Offscreen render size. Defaults to 1280×720. */
	width?: number;
	height?: number;
	/** Downscale factor for the stored thumbnail. Defaults to 0.25 (≈320px wide). */
	pixelRatio?: number;
	/** How long to wait for the board to load and settle, in ms. Defaults to 2500. */
	settleMs?: number;
	/** JPEG quality (0-1). Used when format is 'jpeg'. Defaults to 0.7. */
	jpegQuality?: number;
	/** Image format: 'png' or 'jpeg'. Defaults to 'png'. */
	format?: 'png' | 'jpeg';
};

/**
 * Renders a same-origin board route in a hidden iframe and captures it as a
 * PNG or JPEG data URL for the admin preview slot.
 *
 * html-to-image serializes the DOM into SVG foreignObject, so the browser's
 * own engine paints it — modern CSS (oklch, color-mix, backdrop-blur) works,
 * unlike html2canvas which re-implements painting and throws on Tailwind v4
 * colors. Throws when the board fails to load or capture is blocked.
 *
 * Chromium propagates Fullscreen API requests from same-origin iframes to the
 * top-level window, which makes the admin page jump to fullscreen mid-capture and
 * can break the screenshot. Safari scopes it to the iframe. To avoid the problem
 * the capture always appends `?no-fullscreen=1`; `leaderboard/+layout.svelte`
 * reads that param and skips auto-fullscreen.
 */
export async function captureBoardThumbnail(path: string, opts?: CaptureOptions): Promise<string> {
	const width = opts?.width ?? 1280;
	const height = opts?.height ?? 720;
	const pixelRatio = opts?.pixelRatio ?? 0.25;
	const settleMs = opts?.settleMs ?? 2500;
	const format = opts?.format ?? 'png';
	const jpegQuality = opts?.jpegQuality ?? 0.7;

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
			const src = new URL(path, window.location.origin);
			src.searchParams.set('no-fullscreen', '1');
			iframe.src = src.href;
		});
		// Let Convex data arrive and the first paint settle before capturing.
		await new Promise((r) => window.setTimeout(r, settleMs));
		const doc = iframe.contentDocument;
		if (!doc?.documentElement) throw new Error('Thumbnail capture was blocked');
		if (format === 'jpeg') {
			return await toJpeg(doc.documentElement, {
				pixelRatio,
				quality: jpegQuality,
				cacheBust: false
			});
		}
		return await toPng(doc.documentElement, { pixelRatio, cacheBust: false });
	} finally {
		iframe.remove();
	}
}
