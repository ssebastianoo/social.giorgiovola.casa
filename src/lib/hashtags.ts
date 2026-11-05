// letters (any script, with their combining marks), digits and underscores
const TAG_CHARS = /^[\p{L}\p{M}\p{N}_]+/u;
const HAS_LETTER = /\p{L}/u;
export const MAX_HASHTAG_LENGTH = 64;

/** The normalized form tags are stored and linked with: lowercase, NFC. */
export const normalizeTag = (tag: string) => tag.normalize('NFC').toLowerCase();

/**
 * Splits a whitespace-delimited word starting with "#" into the hashtag and the text after it
 * (trailing punctuation: "#svelte," → "svelte" and ","). Null when the word isn't a hashtag:
 * a tag needs a letter, so "#1" stays text, and overly long ones are ignored.
 */
export function parseHashtag(word: string): { tag: string; rest: string } | null {
	if (!word.startsWith('#')) return null;
	const match = TAG_CHARS.exec(word.slice(1));
	if (!match) return null;
	const tag = match[0];
	if (tag.length > MAX_HASHTAG_LENGTH || !HAS_LETTER.test(tag)) return null;
	return { tag, rest: word.slice(1 + tag.length) };
}

/** The distinct normalized hashtags of a post's content. */
export function extractHashtags(content: string): string[] {
	const tags = new Set<string>();
	for (const word of content.split(/\s+/)) {
		const parsed = parseHashtag(word);
		if (parsed) tags.add(normalizeTag(parsed.tag));
	}
	return [...tags];
}

export const hashtagHref = (tag: string) => `/hashtag/${encodeURIComponent(normalizeTag(tag))}`;
