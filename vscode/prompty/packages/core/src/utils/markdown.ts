import { Marked, type MarkedOptions } from 'marked';

/**
 * Shared markdown rendering with HTML sanitization.
 * Prevents XSS and data exfiltration via remote images.
 * Used by both previewPanel.ts and chatPanel.ts to eliminate
 * duplicated escapeHtml / isAsyncIterable / tryFormatJsonString helpers.
 */

export function escapeHtml(content: string): string {
	return content
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
	return escapeHtml(value).replace(/"/g, '&quot;');
}

function createMarked(allowRemoteImages: boolean): Marked {
	const renderer = {
		// Block raw HTML passthrough — escape it instead
		html(token: string | { text: string }): string {
			return escapeHtml(typeof token === 'string' ? token : token.text);
		},
		// Only allow remote images when explicitly enabled (e.g. image-generation agents)
		image(...args: unknown[]): string {
			const first = args[0];
			const href = typeof first === 'string'
				? first
				: ((first as { href?: string })?.href ?? '');
			const alt = typeof first === 'string'
				? String(args[2] ?? '')
				: ((first as { text?: string })?.text ?? '');
			if (!allowRemoteImages || !/^https?:\/\//i.test(href)) {
				return escapeHtml(alt || href);
			}
			return `<img src="${escapeAttr(href)}" alt="${escapeAttr(alt)}">`;
		},
	};
	return new Marked({ async: false, renderer: renderer as unknown as MarkedOptions['renderer'] });
}

const withImages = createMarked(true);
const withoutImages = createMarked(false);

export function renderSafeMarkdown(markdown: string, allowRemoteImages: boolean): string {
	return (allowRemoteImages ? withImages : withoutImages).parse(markdown, { async: false }) as string;
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return value != null && typeof value === 'object' && Symbol.asyncIterator in value;
}

export function tryFormatJsonString(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
		return undefined;
	}
	try {
		return JSON.stringify(JSON.parse(trimmed), null, 2);
	} catch {
		return undefined;
	}
}
