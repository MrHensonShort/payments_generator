/**
 * src/domain/types.ts
 *
 * Domain interfaces for the Payments Generator (P2-05 / CLA-34).
 *
 * All rule engines (RecurringEngine, EpisodeEngine, ScatterEngine) operate on
 * the types defined here.  The infrastructure layer stores these as
 * `RuleEntry.config` (typed as `unknown`) and narrows to the concrete type
 * before passing to the engine.
 *
 * Design principles:
 *   - No `any` types.
 *   - All discriminated unions use a required `type` literal field.
 *   - Amounts are always plain numbers (EUR, positive = credit/income,
 *     negative = debit/expense unless sign is implicit from `transactionType`).
 *   - Dates are ISO 8601 strings (YYYY-MM-DD) unless noted.
 */

import type { AmountConfig, TrendConfig } from './AmountCalculator.js';
import type { FederalState, PaymentMode } from './calendar/WorkingDayCalendar.js';
import type { Category } from './category/categoryEnum.js';

// Re-export shared amount/trend types so consumers only need one import.
export type { AmountConfig, TrendConfig };

// ── Enumerations ──────────────────────────────────────────────────────────────

/**
 * Transaction sign convention.
 *
 * - `income`   : credit to the account (positive amount)
 * - `expense`  : debit from the account (negative amount)
 * - `transfer` : internal movement; sign determined by AmountConfig
 */
export type TransactionType = 'income' | 'expense' | 'transfer';

/**
 * How the booking day is resolved from the nominal schedule date.
 *
 * - `fix`     : use the exact calendar day without adjustment
 * - `working` : advance to the next working day if the nominal date is a weekend
 *               or public holiday (SEPA mode only; no-op in Instant mode)
 * - `ultimo`  : use the last calendar day of the month (then optionally adjust
 *               with `working` semantics in SEPA mode)
 * - `sepa`    : strictly a SEPA business day – always advance to the next
 *               working day in SEPA mode; identical to `fix` in Instant mode
 */
export type BookingDayType = 'fix' | 'working' | 'ultimo' | 'sepa';

/**
 * Recurring cycle periods.
 */
export type CyclePeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

// ── FrequencyConfig ───────────────────────────────────────────────────────────

/**
 * Frequency configuration for `EpisodeRule`.
 *
 * - `regular`   : the episode is generated on every cycle without exception.
 * - `irregular` : the episode is generated with the given `probability` on each
 *                 cycle (0 = never, 1 = always).  Uses the rule RNG.
 */
export type FrequencyConfig = { mode: 'regular' } | { mode: 'irregular'; probability: number };

// ── CountConfig ───────────────────────────────────────────────────────────────

/**
 * Count configuration for `ScatterRule`.
 *
 * - `fixed` : generates exactly `count` transactions.
 * - `range` : generates a random integer in [min, max] (inclusive) per cycle.
 */
export type CountConfig =
  | { mode: 'fixed'; count: number }
  | { mode: 'range'; min: number; max: number };

// ── BaseRule ──────────────────────────────────────────────────────────────────

/**
 * Shared fields present on every rule type.
 *
 * Concrete rule types extend this via intersection (`BaseRule & { ... }`).
 */
export interface BaseRule {
  /** Unique identifier (UUID). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Discriminator used to route to the correct engine. */
  type: 'recurring' | 'episode' | 'scatter';
  /** Whether the rule is active.  Disabled rules are skipped during generation. */
  enabled: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /**
   * Optional seed for the deterministic PRNG.  When set, generation output
   * is reproducible.  Overrides the global AppConfig seed for this rule.
   */
  seed?: number;
}

// ── RecurringRule ─────────────────────────────────────────────────────────────

/**
 * A standing order or recurring direct debit (Dauerauftrag / Lastschrift).
 *
 * Generates one transaction per cycle within the requested date range.
 * The nominal day-of-month is resolved to an actual booking date using the
 * `bookingDayType` + `WorkingDayCalendar`.
 *
 * Example: a monthly rent payment on the 1st of each month.
 */
export interface RecurringRule extends BaseRule {
  type: 'recurring';
  /** Counterparty name (recipient or sender). */
  counterparty: string;
  /** Verwendungszweck – payment reference text. */
  purpose: string;
  /** Transaction category. */
  category: Category;
  /** Income, expense, or internal transfer. */
  transactionType: TransactionType;
  /** Amount and optional trend configuration. */
  amount: AmountConfig;
  /** Optional trend applied on top of the base amount. */
  trend?: TrendConfig;
  /** How often the transaction recurs. */
  cycle: CyclePeriod;
  /**
   * Nominal day-of-month for the transaction (1–31).
   * For `ultimo` booking type this field is ignored.
   * Clamped to the last valid day of shorter months (e.g. 31 → 28 in Feb).
   */
  dayOfMonth: number;
  /** How the nominal date is resolved to an actual booking date. */
  bookingDayType: BookingDayType;
}

// ── EpisodeRule ───────────────────────────────────────────────────────────────

/**
 * An episodic booking rule – periodic events that are not guaranteed
 * (e.g. a quarterly dentist visit or an irregular restaurant meal).
 *
 * Multiple categories can be configured; the engine picks one at random per
 * occurrence using the rule RNG.
 */
export interface EpisodeRule extends BaseRule {
  type: 'episode';
  /** Counterparty name(s); one is picked at random per occurrence if multiple. */
  counterparties: string[];
  /** Reference text; may include a placeholder `{n}` replaced by occurrence index. */
  purpose: string;
  /**
   * Possible categories for the episode.
   * At least one must be provided; one is chosen per occurrence.
   */
  categories: [Category, ...Category[]];
  /** Income, expense, or internal transfer. */
  transactionType: TransactionType;
  /** Amount per occurrence. */
  amount: AmountConfig;
  /** Optional trend applied on top of the base amount. */
  trend?: TrendConfig;
  /** Whether the episode is generated regularly or with a given probability. */
  frequency: FrequencyConfig;
  /** Cycle period at which the frequency check is applied. */
  cycle: CyclePeriod;
  /** How the episode date within the cycle is resolved. */
  bookingDayType: BookingDayType;
}

// ── ScatterRule ───────────────────────────────────────────────────────────────

/**
 * A scatter rule – generates a random number of transactions within each
 * calendar month, spread over random days and times.
 *
 * Typical use-cases: supermarket shopping, restaurant visits, fuel purchases.
 * A budget cap (per cycle) prevents runaway generation.
 */
export interface ScatterRule extends BaseRule {
  type: 'scatter';
  /** Possible counterparty names; one is picked per transaction. */
  counterparties: string[];
  /** Reference text template; `{n}` is replaced by the transaction index. */
  purpose: string;
  /** Possible categories; one is chosen per transaction. */
  categories: [Category, ...Category[]];
  /** Income, expense, or internal transfer. */
  transactionType: TransactionType;
  /** Amount per single scatter transaction. */
  amount: AmountConfig;
  /** Optional trend applied to each scatter transaction. */
  trend?: TrendConfig;
  /** Number of transactions to generate per cycle. */
  count: CountConfig;
  /**
   * Maximum total absolute amount (EUR) per cycle.
   * Generation stops early if the running total would exceed this cap.
   * Set to `Infinity` to disable.
   */
  budgetPerCycle: number;
}

// ── AnyRule ───────────────────────────────────────────────────────────────────

/** Union of all concrete rule types – use for type narrowing at call sites. */
export type AnyRule = RecurringRule | EpisodeRule | ScatterRule;

// ── GenerationContext ─────────────────────────────────────────────────────────

/**
 * Runtime parameters passed to each engine's `generate()` method.
 * Derived from `AppConfigEntry` at the start of a generation run.
 */
export interface GenerationContext {
  /** Inclusive start of the generation period (YYYY-MM-DD). */
  startDate: string;
  /** Inclusive end of the generation period (YYYY-MM-DD). */
  endDate: string;
  /** Payment system mode – controls working-day logic. */
  paymentMode: PaymentMode;
  /** German federal state for public-holiday resolution. */
  federalState: FederalState;
  /**
   * Global PRNG seed.  Individual rules may override this via `BaseRule.seed`.
   * `undefined` → use `Math.random` (non-deterministic).
   */
  globalSeed?: number;
}

// ── Transaction ───────────────────────────────────────────────────────────────

/**
 * A fully resolved payment transaction produced by an engine.
 *
 * This is the output type of all `generate()` methods.  It maps directly to
 * `TransactionEntry` in the infrastructure layer (same shape, typed here for
 * domain use without the DB dependency).
 */
export interface Transaction {
  /** UUID primary key (generated by the engine). */
  id: string;
  /** Settlement date: YYYY-MM-DD. */
  date: string;
  /** Settlement time: HH:MM. */
  time: string;
  /** Amount in EUR.  Positive = credit, negative = debit. */
  amount: number;
  /** Payment reference text (Verwendungszweck). */
  purpose: string;
  /** Counterparty name. */
  counterparty: string;
  /** Transaction category key. */
  category: Category;
  /** Which engine produced this transaction. */
  source: 'recurring' | 'episode' | 'scatter' | 'manual';
  /** ID of the originating rule. */
  ruleId?: string;
}
