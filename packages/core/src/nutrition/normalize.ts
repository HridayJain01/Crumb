/** Words that never identify a food. Removed before matching. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'some',
  'of',
  'my',
  'i',
  'had',
  'have',
  'having',
  'ate',
  'eaten',
  'drank',
  'also',
  'then',
  'just',
  'little',
  'bit',
  'fresh',
  'homemade',
  'home',
  'made',
  'small',
  'medium',
  'large',
  'big',
  'tiny',
  'huge',
  'regular',
  'normal',
  'usual',
  'today',
  'yesterday',
  'this',
  'that',
  'for',
  'at',
  'in',
  'on',
  'to',
  'and',
  'with',
  'plus',
  'about',
  'around',
  'approx',
  'approximately',
]);

const KEEP_PLURAL = new Set(['chole', 'oats', 'bhatura', 'peas']);

/** Very small English singularizer, applied identically to aliases and user text. */
export function singularize(token: string): string {
  if (token.length <= 3 || KEEP_PLURAL.has(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('oes')) return token.slice(0, -2);
  if (token.endsWith('ches') || token.endsWith('shes')) return token.slice(0, -2);
  if (token.endsWith('ss') || token.endsWith('us')) return token;
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Normalized key: lowercase, punctuation removed, stopwords dropped, tokens singularized. */
export function normalizeFoodName(text: string): string {
  return tokenize(text)
    .filter((t) => !STOPWORDS.has(t))
    .map(singularize)
    .join(' ');
}

export function slugify(text: string): string {
  return normalizeFoodName(text).replace(/\s+/g, '-').slice(0, 60) || 'food';
}

/** Collapse whitespace, strip control characters and cap length; for any user/AI-provided label. */
export function cleanLabel(text: string, max = 80): string {
  return text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
