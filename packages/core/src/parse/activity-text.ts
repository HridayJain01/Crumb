import type { AiActivity, AiActivityInterpretation } from '../schemas/ai';
import type { Intensity } from '../schemas/activity';
import { capitalize } from '../util';
import { cleanLabel } from '../nutrition/normalize';

/* Offline parser for activity descriptions like "30-minute upper-body workout" or "walked 5 km". */

const TYPE_CUES: [AiActivity['type'], RegExp][] = [
  ['hiit', /\b(hiit|crossfit|circuit|tabata|burpees?)\b/],
  ['run', /\b(run|ran|running|jog|jogged|jogging|sprints?)\b/],
  ['walk', /\b(walk|walked|walking|stroll|hike|hiked|hiking|trek)\b/],
  ['cycling', /\b(cycl\w*|bike|biked|biking|spin)\b/],
  ['swimming', /\b(swim|swam|swimming|laps)\b/],
  ['yoga', /\b(yoga|pilates|stretch\w*|surya namaskar|mobility)\b/],
  ['dance', /\b(danc\w*|zumba|aerobics)\b/],
  [
    'sports',
    /\b(football|soccer|cricket|badminton|tennis|basketball|volleyball|squash|table tennis|kabaddi)\b/,
  ],
  [
    'strength',
    /\b(gym|workout|weights?|lift\w*|strength|upper[- ]?body|lower[- ]?body|leg day|push[- ]?ups?|squats?|deadlifts?|bench|resistance|calisthenics|abs|core)\b/,
  ],
];

const LABELS: Record<AiActivity['type'], string> = {
  walk: 'Walk',
  run: 'Run',
  cycling: 'Cycling',
  strength: 'Strength workout',
  yoga: 'Yoga',
  hiit: 'HIIT',
  swimming: 'Swimming',
  dance: 'Dance',
  sports: 'Sports',
  other: 'Workout',
};

function parseDurationMin(text: string): number | null {
  const hm = text.match(
    /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b(?:\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minutes?)\b)?/,
  );
  if (hm) return Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0);
  const m = text.match(/(\d+(?:\.\d+)?)\s*[- ]?\s*(?:m|min|mins|minute|minutes)\b/);
  if (m) return Number(m[1]);
  if (/\bhalf (an )?hour\b/.test(text)) return 30;
  if (/\b(an|one) hour\b/.test(text)) return 60;
  if (/\bquarter hour\b/.test(text)) return 15;
  return null;
}

function parseDistanceKm(text: string): number | null {
  const km = text.match(/(\d+(?:\.\d+)?)\s*(?:km|kms|kilometers?|kilometres?)\b/);
  if (km) return Number(km[1]);
  const mi = text.match(/(\d+(?:\.\d+)?)\s*(?:mi|miles?)\b/);
  if (mi) return Number(mi[1]) * 1.609;
  return null;
}

function parseSteps(text: string): number | null {
  const s = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k)?\s*steps?\b/);
  if (!s) return null;
  return Math.round(Number(s[1]) * (s[2] ? 1000 : 1));
}

function parseIntensity(text: string): Intensity {
  if (
    /\b(intense|intensely|hard|heavy|vigorous|fast|brisk|briskly|sprint|tough|high[- ]intensity)\b/.test(
      text,
    )
  )
    return 'vigorous';
  if (/\b(light|easy|slow|slowly|gentle|relaxed|casual|leisurely)\b/.test(text)) return 'light';
  return 'moderate';
}

export function parseActivityText(text: string): AiActivityInterpretation {
  const lower = text.toLowerCase();
  const parts = lower
    .split(
      /,|;|\band then\b|\bthen\b|\bplus\b|\band\b(?=\s+(?:a|an|\d|did|went|walked|ran|played))/,
    )
    .map((p) => p.trim())
    .filter(Boolean);

  const activities: AiActivity[] = [];
  for (const part of parts) {
    const type = TYPE_CUES.find(([, re]) => re.test(part))?.[0];
    const durationMin = parseDurationMin(part);
    const distanceKm = parseDistanceKm(part);
    const steps = parseSteps(part);
    if (!type && durationMin === null && distanceKm === null) continue;
    const resolved = type ?? 'other';
    const label = /\bupper[- ]?body\b/.test(part)
      ? 'Upper-body workout'
      : /\blower[- ]?body|leg day\b/.test(part)
        ? 'Lower-body workout'
        : LABELS[resolved];
    activities.push({
      type: resolved,
      label: capitalize(cleanLabel(label, 60)),
      durationMin,
      distanceKm,
      steps,
      intensity: parseIntensity(part),
    });
  }
  return { activities: activities.slice(0, 6) };
}
