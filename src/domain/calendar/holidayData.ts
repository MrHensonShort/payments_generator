/**
 * src/domain/calendar/holidayData.ts
 *
 * Static holiday lookup table for all 16 German federal states, covering
 * years 2000–2050 (P1-05, AT-01 to AT-07, E-02).
 *
 * The table is computed once at module initialisation (build-time equivalent)
 * using the Anonymous Gregorian Easter algorithm plus fixed-date and derived
 * state-specific holidays.  The result is cached in a Map for O(1) lookups.
 *
 * Supported states (ISO 3166-2:DE):
 *   DE-BB  Brandenburg         DE-BE  Berlin
 *   DE-BW  Baden-Württemberg   DE-BY  Bavaria
 *   DE-HB  Bremen              DE-HE  Hesse
 *   DE-HH  Hamburg             DE-MV  Mecklenburg-Vorpommern
 *   DE-NI  Lower Saxony        DE-NW  North Rhine-Westphalia
 *   DE-RP  Rhineland-Palatinate DE-SH  Schleswig-Holstein
 *   DE-SL  Saarland            DE-SN  Saxony
 *   DE-ST  Saxony-Anhalt       DE-TH  Thuringia
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FederalState =
  | 'DE-BB'
  | 'DE-BE'
  | 'DE-BW'
  | 'DE-BY'
  | 'DE-HB'
  | 'DE-HE'
  | 'DE-HH'
  | 'DE-MV'
  | 'DE-NI'
  | 'DE-NW'
  | 'DE-RP'
  | 'DE-SH'
  | 'DE-SL'
  | 'DE-SN'
  | 'DE-ST'
  | 'DE-TH';

/** All 16 German federal state codes (ISO 3166-2:DE). */
export const FEDERAL_STATES: readonly FederalState[] = [
  'DE-BB',
  'DE-BE',
  'DE-BW',
  'DE-BY',
  'DE-HB',
  'DE-HE',
  'DE-HH',
  'DE-MV',
  'DE-NI',
  'DE-NW',
  'DE-RP',
  'DE-SH',
  'DE-SL',
  'DE-SN',
  'DE-ST',
  'DE-TH',
];

export const HOLIDAY_YEAR_MIN = 2000;
export const HOLIDAY_YEAR_MAX = 2050;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian
 * algorithm (also called the "Meeus/Jones/Butcher" algorithm).
 * Returns a UTC-midnight Date.
 */
function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a UTC Date as YYYY-MM-DD. */
function toKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Return a new UTC Date offset by n days. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Build a YYYY-MM-DD key from components. */
function fixed(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Buß- und Bettag: the Wednesday between November 16 and November 22.
 * This is only a public holiday in Saxony (DE-SN).
 */
function bussBettag(year: number): string {
  for (let day = 16; day <= 22; day++) {
    const d = new Date(Date.UTC(year, 10, day)); // month 10 = November (0-based)
    if (d.getUTCDay() === 3) {
      // 3 = Wednesday
      return toKey(d);
    }
  }
  /* istanbul ignore next */
  throw new Error(`BußBettag: no Wednesday in Nov 16-22 for year ${year}`);
}

// ── States with Reformationstag before 2018 ──────────────────────────────────
// Eastern German states (historically Protestant) had Oct 31 as a public
// holiday already before the 2018 church reformation anniversary law.
const REFORMATION_STATES_PRE_2018: ReadonlySet<string> = new Set([
  'DE-BB',
  'DE-MV',
  'DE-SN',
  'DE-ST',
  'DE-TH',
]);

// States that gained Reformationstag from 2018 onwards.
const REFORMATION_STATES_FROM_2018: ReadonlySet<string> = new Set([
  'DE-BB',
  'DE-HB',
  'DE-HH',
  'DE-MV',
  'DE-NI',
  'DE-SH',
  'DE-SN',
  'DE-ST',
  'DE-TH',
]);

// ── Holiday computation ───────────────────────────────────────────────────────

/**
 * Compute all public-holiday date keys (YYYY-MM-DD) for the given year and
 * federal state.  Returns a new Set.
 */
function computeHolidays(year: number, state: FederalState): Set<string> {
  const easter = computeEaster(year);
  const h = new Set<string>();

  // === National holidays (all 16 states) ===
  h.add(fixed(year, 1, 1)); // Neujahr
  h.add(toKey(addDays(easter, -2))); // Karfreitag (Good Friday)
  h.add(toKey(addDays(easter, 1))); // Ostermontag (Easter Monday)
  h.add(fixed(year, 5, 1)); // Tag der Arbeit (May Day)
  h.add(toKey(addDays(easter, 39))); // Christi Himmelfahrt (Ascension)
  h.add(toKey(addDays(easter, 50))); // Pfingstmontag (Whit Monday)
  h.add(fixed(year, 10, 3)); // Tag der Deutschen Einheit
  h.add(fixed(year, 12, 25)); // 1. Weihnachtstag
  h.add(fixed(year, 12, 26)); // 2. Weihnachtstag

  // === Heilige Drei Könige – Epiphany (January 6) ===
  // BW, BY, ST
  if (state === 'DE-BW' || state === 'DE-BY' || state === 'DE-ST') {
    h.add(fixed(year, 1, 6));
  }

  // === Internationaler Frauentag – International Women's Day (March 8) ===
  // BE: public holiday from 2019; MV: from 2023
  if (state === 'DE-BE' && year >= 2019) {
    h.add(fixed(year, 3, 8));
  }
  if (state === 'DE-MV' && year >= 2023) {
    h.add(fixed(year, 3, 8));
  }

  // === Fronleichnam – Corpus Christi (Easter + 60 days) ===
  // BW, BY, HE, NW, RP, SL
  if (
    state === 'DE-BW' ||
    state === 'DE-BY' ||
    state === 'DE-HE' ||
    state === 'DE-NW' ||
    state === 'DE-RP' ||
    state === 'DE-SL'
  ) {
    h.add(toKey(addDays(easter, 60)));
  }

  // === Maria Himmelfahrt – Assumption of Mary (August 15) ===
  // BY (predominantly Catholic municipalities; treated statewide here), SL
  if (state === 'DE-BY' || state === 'DE-SL') {
    h.add(fixed(year, 8, 15));
  }

  // === Weltkindertag – World Children's Day (September 20) ===
  // TH: from 2019
  if (state === 'DE-TH' && year >= 2019) {
    h.add(fixed(year, 9, 20));
  }

  // === Reformationstag – Reformation Day (October 31) ===
  // 2017: one-time national holiday for 500th anniversary (all states)
  // 2018+: BB, HB, HH, MV, NI, SH, SN, ST, TH
  // Before 2017: BB, MV, SN, ST, TH
  if (year === 2017) {
    h.add(fixed(year, 10, 31));
  } else if (year >= 2018) {
    if (REFORMATION_STATES_FROM_2018.has(state)) {
      h.add(fixed(year, 10, 31));
    }
  } else {
    if (REFORMATION_STATES_PRE_2018.has(state)) {
      h.add(fixed(year, 10, 31));
    }
  }

  // === Allerheiligen – All Saints' Day (November 1) ===
  // BW, BY, NW, RP, SL
  if (
    state === 'DE-BW' ||
    state === 'DE-BY' ||
    state === 'DE-NW' ||
    state === 'DE-RP' ||
    state === 'DE-SL'
  ) {
    h.add(fixed(year, 11, 1));
  }

  // === Buß- und Bettag – Repentance Day (Wed between Nov 16–22) ===
  // SN only
  if (state === 'DE-SN') {
    h.add(bussBettag(year));
  }

  return h;
}

// ── Pre-computed lookup table (2000–2050, all 16 states) ─────────────────────

/**
 * Cache key format: `{year}-{state}`, e.g. "2024-DE-BY".
 * Values are sets of YYYY-MM-DD date strings for that year/state.
 */
const HOLIDAY_CACHE = new Map<string, Set<string>>();

for (const state of FEDERAL_STATES) {
  for (let year = HOLIDAY_YEAR_MIN; year <= HOLIDAY_YEAR_MAX; year++) {
    HOLIDAY_CACHE.set(`${year}-${state}`, computeHolidays(year, state));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the set of public-holiday date keys (YYYY-MM-DD) for the given year
 * and federal state.
 *
 * Returns undefined when the year is outside [2000, 2050].
 */
export function getHolidaySet(year: number, state: FederalState): Set<string> | undefined {
  return HOLIDAY_CACHE.get(`${year}-${state}`);
}

/**
 * Return true if `date` is a public holiday in the given German federal state.
 *
 * - When `state` is provided: checks national + state-specific holidays.
 * - When `state` is undefined: checks national holidays only (shared by all
 *   16 states: Neujahr, Karfreitag, Ostermontag, May Day, Ascension, Whit
 *   Monday, German Unity Day, Christmas 1 & 2).
 * - Always returns false for years outside [2000, 2050].
 */
export function isPublicHoliday(date: Date, state?: FederalState): boolean {
  const year = date.getUTCFullYear();
  if (year < HOLIDAY_YEAR_MIN || year > HOLIDAY_YEAR_MAX) return false;
  const key = toKey(date);

  if (state !== undefined) {
    return HOLIDAY_CACHE.get(`${year}-${state}`)?.has(key) ?? false;
  }

  // No state: check against any single state that has no state-specific
  // additions common to all (DE-HH is safe: no state-specific holidays
  // before Reformationstag 2018, which is still not universal).
  // Simpler: check all states share this key (i.e. it's in every cache set).
  // For performance we compute national-only using DE-HH for years < 2018,
  // DE-NI for 2018+ (both only have national + Reformationstag on Oct 31,
  // but we want just national).  Safest: use DE-HE (only national + Fronleichnam).
  // Instead, we check whether the key appears in the NATIONAL_HOLIDAYS set
  // computed for one reference state that has NO state-specific holidays for
  // the given year.  DE-HH before 2018 has only national holidays.
  // DE-NI before 2018 has only national holidays.
  // Both from 2018 gain Reformationstag.  So we cannot use them directly.
  //
  // The cleanest solution: compute national holidays inline.
  const easter = computeEaster(year);
  const nationals = new Set<string>([
    fixed(year, 1, 1),
    toKey(addDays(easter, -2)),
    toKey(addDays(easter, 1)),
    fixed(year, 5, 1),
    toKey(addDays(easter, 39)),
    toKey(addDays(easter, 50)),
    fixed(year, 10, 3),
    fixed(year, 12, 25),
    fixed(year, 12, 26),
  ]);
  return nationals.has(key);
}

/**
 * Return true if `date` falls on a Saturday or Sunday.
 * Uses UTC date components to avoid timezone-dependent shifts.
 */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/** Re-export the key formatter so consumers can build cache keys consistently. */
export { toKey as formatDateKey };
