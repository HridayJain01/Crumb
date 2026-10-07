/*
 * Tone rules (PRD §5.6, §41): no shaming, no medical claims, no extreme advice.
 * Any AI wording containing these patterns is discarded in favour of a template.
 */
const BANNED: RegExp[] = [
  /\bfail(ed|ure|ing)?\b/i,
  /\bbad\b/i,
  /\bcheat(ing|ed)?\b/i,
  /\bguilt(y)?\b/i,
  /\bshame(ful)?\b/i,
  /\blazy\b/i,
  /\bdisgust/i,
  /\bpunish/i,
  /\bstarv/i,
  /\bskip (a |your )?(meal|breakfast|lunch|dinner)/i,
  /\bfast(ing)? (for|until)\b/i,
  /\bdiagnos/i,
  /\b(diabetes|diabetic|hypertension|disease|disorder|cure|treat(ment)?|prescri)/i,
  /\bmedication\b/i,
  /\bguarantee/i,
];

export function containsBannedLanguage(text: string): boolean {
  return BANNED.some((re) => re.test(text));
}

export const DISCLAIMER =
  'Nutrition, calorie, activity and exercise values are estimates and should not be treated as medical advice.';

export const WALK_DISCLAIMER = 'Check the route and local conditions before walking.';
