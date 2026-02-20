const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(input) {
	if (!input || typeof input !== 'string') {
		return null;
	}

	const trimmed = input.trim();
	if (YOUTUBE_ID_REGEX.test(trimmed)) {
		return trimmed;
	}

	let parsed;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}

	const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
	const path = parsed.pathname;

	if (host === 'youtu.be') {
		const candidate = path.slice(1).split('/')[0];
		return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
	}

	if (host === 'youtube.com' || host === 'music.youtube.com' || host.endsWith('.youtube.com')) {
		const watchId = parsed.searchParams.get('v');
		if (watchId && YOUTUBE_ID_REGEX.test(watchId)) {
			return watchId;
		}

		const segments = path.split('/').filter(Boolean);
		if (segments.length >= 2 && (segments[0] === 'embed' || segments[0] === 'shorts')) {
			return YOUTUBE_ID_REGEX.test(segments[1]) ? segments[1] : null;
		}
	}

	return null;
}

export async function fetchVideoMeta(youtubeId) {
	const fallback = {
		title: 'Unknown Track',
		thumbnail: `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
	};

	if (!YOUTUBE_ID_REGEX.test(youtubeId)) {
		return fallback;
	}

	const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}&format=json`;

	try {
		const response = await fetch(oEmbedUrl, { method: 'GET' });
		if (!response.ok) {
			return fallback;
		}

		const data = await response.json();
		return {
			title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : fallback.title,
			thumbnail: typeof data.thumbnail_url === 'string' && data.thumbnail_url.trim()
				? data.thumbnail_url
				: fallback.thumbnail
		};
	} catch {
		return fallback;
	}
}
