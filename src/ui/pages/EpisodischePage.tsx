/**
 * EpisodischePage – EpisodeGenerator form (P4b-02 / CLA-54).
 *
 * Features:
 *  - Mode-toggle: regular / irregular (with probability slider)
 *  - Multi-category selection (at least one required)
 *  - Multiple counterparties (comma-separated input)
 *  - FrequencyConfig, CyclePeriod, BookingDayType
 *  - Rule list with Edit/Delete (ConfirmModal)
 *  - Generate button → WorkerProxy
 *  - Preview: expected transaction count (CLA-61)
 *  - data-testid attributes on all interactive elements
 */
import { useState, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Play } from 'lucide-react';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { Label } from '@/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import { ConfirmModal } from '@/ui/components/confirm-modal';
import { AmountConfigField } from '@/ui/components/amount-config-field';
import { MultiCategorySelect } from '@/ui/components/multi-category-select';
import { ProgressBar } from '@/ui/components/progress-bar';
import { useRules } from '@/ui/hooks/useRules';
import { useAppConfigStore, selectConfig } from '@/ui/stores/appConfig';
import { workerProxy } from '@/ui/WorkerProxy';
import type { AmountConfig } from '@/domain/AmountCalculator';
import type {
  BookingDayType,
  CyclePeriod,
  EpisodeRule,
  FrequencyConfig,
  TransactionType,
} from '@/domain/types';
import { getCategoryLabel, type Category } from '@/domain/category/categoryEnum';
import type { RuleEntry } from '@/infrastructure/database';

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  counterparties: string; // comma-separated
  purpose: string;
  categories: Category[];
  transactionType: TransactionType;
  amount: AmountConfig;
  frequencyMode: 'regular' | 'irregular';
  probability: number;
  cycle: CyclePeriod;
  bookingDayType: BookingDayType;
}

const DEFAULT_FORM: FormState = {
  name: '',
  counterparties: '',
  purpose: '',
  categories: ['Arzt/Gesundheit' as Category],
  transactionType: 'expense',
  amount: { mode: 'fix', amount: 0 },
  frequencyMode: 'regular',
  probability: 0.5,
  cycle: 'monthly',
  bookingDayType: 'fix',
};

// ── Validation ─────────────────────────────────────────────────────────────────

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Name ist erforderlich';
  if (!form.counterparties.trim()) errors.counterparties = 'Mindestens ein Gegenkonto erforderlich';
  if (!form.purpose.trim()) errors.purpose = 'Verwendungszweck ist erforderlich';
  if (form.categories.length === 0) errors.categories = 'Mindestens eine Kategorie erforderlich';
  if (form.amount.mode === 'fix' && form.amount.amount === 0)
    errors.amount = 'Betrag darf nicht 0 sein';
  if (form.amount.mode === 'range' && form.amount.min >= form.amount.max)
    errors.amount = 'Min muss kleiner als Max sein';
  if (form.frequencyMode === 'irregular' && (form.probability <= 0 || form.probability > 1))
    errors.probability = 'Wahrscheinlichkeit muss zwischen 0 und 1 liegen';
  return errors;
}

// ── Preview calculation helper (CLA-61) ───────────────────────────────────────

function calcExpectedCount(
  form: FormState,
  dateFrom: string,
  dateTo: string,
): { expected: number; max: number } | null {
  if (!dateFrom || !dateTo) return null;
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return null;

  const monthsDiff =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

  const cycleMultiplier: Record<CyclePeriod, number> = {
    monthly: 1,
    quarterly: 1 / 3,
    semiannual: 1 / 6,
    annual: 1 / 12,
  };

  const cycles = Math.max(0, Math.floor(monthsDiff * cycleMultiplier[form.cycle]));
  const max = cycles;
  const expected =
    form.frequencyMode === 'regular' ? cycles : Math.round(cycles * form.probability);
  return { expected, max };
}

// ── Component ──────────────────────────────────────────────────────────────────

function EpisodischePage() {
  const { rules, loading, addRule, updateRule, deleteRule } = useRules('episode');
  const config = useAppConfigStore(selectConfig);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<RuleEntry | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [genMsg, setGenMsg] = useState('');

  const patch = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  const preview = useMemo(
    () => calcExpectedCount(form, config.dateFrom, config.dateTo),
    [form, config.dateFrom, config.dateTo],
  );

  const startEdit = useCallback((entry: RuleEntry) => {
    const rule = entry.config as EpisodeRule;
    setForm({
      name: rule.name,
      counterparties: rule.counterparties.join(', '),
      purpose: rule.purpose,
      categories: rule.categories,
      transactionType: rule.transactionType,
      amount: rule.amount,
      frequencyMode: rule.frequency.mode,
      probability: rule.frequency.mode === 'irregular' ? rule.frequency.probability : 0.5,
      cycle: rule.cycle,
      bookingDayType: rule.bookingDayType,
    });
    setEditingId(entry.id);
    setErrors({});
  }, []);

  const cancelEdit = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setErrors({});
  };

  const handleSubmit = async () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const now = new Date().toISOString();
    const id = editingId ?? crypto.randomUUID();
    const frequency: FrequencyConfig =
      form.frequencyMode === 'regular'
        ? { mode: 'regular' }
        : { mode: 'irregular', probability: form.probability };

    const counterparties = form.counterparties
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const rule: EpisodeRule = {
      id,
      type: 'episode',
      enabled: true,
      createdAt: now,
      name: form.name.trim(),
      counterparties,
      purpose: form.purpose.trim(),
      categories: form.categories as [Category, ...Category[]],
      transactionType: form.transactionType,
      amount: form.amount,
      frequency,
      cycle: form.cycle,
      bookingDayType: form.bookingDayType,
    };

    const entry: RuleEntry = {
      id: rule.id,
      type: 'episode',
      name: rule.name,
      config: rule,
      createdAt: now,
    };

    if (editingId) {
      await updateRule(editingId, entry);
    } else {
      await addRule(entry);
    }
    cancelEdit();
  };

  const handleGenerate = async () => {
    if (rules.length === 0) return;
    setGenerating(true);
    setProgress(0);
    setGenMsg('');
    try {
      const result = await workerProxy.start(
        rules.map((r) => r.id),
        {
          startDate: config.dateFrom,
          endDate: config.dateTo,
          seed: config.seed ?? undefined,
          paymentMode: config.paymentMode,
          stateCode: config.bundesland,
        },
        (evt) => setProgress(evt.percentage),
      );
      setGenMsg(`✓ ${result.transactionCount} Transaktionen generiert (${result.durationMs} ms)`);
    } catch (err) {
      setGenMsg(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-full gap-6 p-6" data-testid="episodische-page">
      {/* ── Left: Form ─────────────────────────────────────────────────────── */}
      <div className="w-96 shrink-0">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          {editingId ? 'Regel bearbeiten' : 'Neue Episodische Buchung'}
        </h2>

        <div className="space-y-4 rounded-lg border bg-card p-4">
          {/* Name */}
          <div>
            <Label htmlFor="ep-name" className="text-xs text-muted-foreground mb-1 block">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ep-name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="z.B. Arztbesuch"
              data-testid="episode-name"
              className={`h-8 text-sm ${errors.name ? 'border-destructive' : ''}`}
            />
            {errors.name && (
              <p className="mt-0.5 text-xs text-destructive" data-testid="episode-name-error">
                {errors.name}
              </p>
            )}
          </div>

          {/* Transaktionstyp */}
          <div>
            <Label htmlFor="ep-tx-type" className="text-xs text-muted-foreground mb-1 block">
              Transaktionstyp <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.transactionType}
              onValueChange={(v) => patch({ transactionType: v as TransactionType })}
            >
              <SelectTrigger
                id="ep-tx-type"
                data-testid="episode-transaction-type"
                className="h-8 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Einnahme</SelectItem>
                <SelectItem value="expense">Ausgabe</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Modus-Toggle */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Häufigkeit</Label>
            <div className="flex gap-2" data-testid="episode-frequency-toggle">
              <Button
                type="button"
                size="sm"
                variant={form.frequencyMode === 'regular' ? 'default' : 'outline'}
                onClick={() => patch({ frequencyMode: 'regular' })}
                data-testid="episode-mode-regular"
                className="flex-1 h-8 text-xs"
              >
                Regelmäßig
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.frequencyMode === 'irregular' ? 'default' : 'outline'}
                onClick={() => patch({ frequencyMode: 'irregular' })}
                data-testid="episode-mode-irregular"
                className="flex-1 h-8 text-xs"
              >
                Unregelmäßig
              </Button>
            </div>

            {form.frequencyMode === 'irregular' && (
              <div className="mt-2">
                <Label
                  htmlFor="ep-probability"
                  className="text-xs text-muted-foreground mb-1 flex justify-between"
                >
                  <span>Wahrscheinlichkeit</span>
                  <span className="font-medium text-foreground">
                    {(form.probability * 100).toFixed(0)} %
                  </span>
                </Label>
                <input
                  id="ep-probability"
                  type="range"
                  min="0.01"
                  max="1"
                  step="0.01"
                  value={form.probability}
                  onChange={(e) => patch({ probability: parseFloat(e.target.value) })}
                  data-testid="episode-probability"
                  className="w-full accent-primary"
                />
                {errors.probability && (
                  <p className="text-xs text-destructive">{errors.probability}</p>
                )}
              </div>
            )}
          </div>

          {/* Zyklus */}
          <div>
            <Label htmlFor="ep-cycle" className="text-xs text-muted-foreground mb-1 block">
              Zyklus
            </Label>
            <Select value={form.cycle} onValueChange={(v) => patch({ cycle: v as CyclePeriod })}>
              <SelectTrigger id="ep-cycle" data-testid="episode-cycle" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="quarterly">Vierteljährlich</SelectItem>
                <SelectItem value="semiannual">Halbjährlich</SelectItem>
                <SelectItem value="annual">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preview (CLA-61) */}
          {preview && (
            <div
              className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              data-testid="episode-preview"
            >
              Vorschau: ca. <span className="font-medium text-foreground">{preview.expected}</span>{' '}
              Buchungen
              {form.frequencyMode === 'irregular' && <> (max. {preview.max})</>}
            </div>
          )}

          {/* Betrag */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Betrag <span className="text-destructive">*</span>
            </Label>
            <AmountConfigField
              value={form.amount}
              onChange={(a) => patch({ amount: a })}
              testIdPrefix="episode-amount"
            />
            {errors.amount && <p className="mt-0.5 text-xs text-destructive">{errors.amount}</p>}
          </div>

          {/* Kategorien */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Kategorien <span className="text-destructive">*</span>
            </Label>
            <MultiCategorySelect
              value={form.categories}
              onChange={(cats) => patch({ categories: cats })}
              data-testid="episode-categories"
            />
            {errors.categories && (
              <p className="mt-0.5 text-xs text-destructive">{errors.categories}</p>
            )}
          </div>

          {/* Gegenkonten */}
          <div>
            <Label htmlFor="ep-counterparties" className="text-xs text-muted-foreground mb-1 block">
              Gegenkonten <span className="text-destructive">*</span>
              <span className="ml-1 opacity-60">(kommagetrennt)</span>
            </Label>
            <Input
              id="ep-counterparties"
              value={form.counterparties}
              onChange={(e) => patch({ counterparties: e.target.value })}
              placeholder="z.B. Dr. Müller, Praxis Meier"
              data-testid="episode-counterparties"
              className={`h-8 text-sm ${errors.counterparties ? 'border-destructive' : ''}`}
            />
            {errors.counterparties && (
              <p className="mt-0.5 text-xs text-destructive">{errors.counterparties}</p>
            )}
          </div>

          {/* Verwendungszweck */}
          <div>
            <Label htmlFor="ep-purpose" className="text-xs text-muted-foreground mb-1 block">
              Verwendungszweck <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ep-purpose"
              value={form.purpose}
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder="z.B. Behandlung Nr. {n}"
              data-testid="episode-purpose"
              className={`h-8 text-sm ${errors.purpose ? 'border-destructive' : ''}`}
            />
            {errors.purpose && <p className="mt-0.5 text-xs text-destructive">{errors.purpose}</p>}
          </div>

          {/* Buchungstagtyp */}
          <div>
            <Label htmlFor="ep-booking-day" className="text-xs text-muted-foreground mb-1 block">
              Buchungstagtyp
            </Label>
            <Select
              value={form.bookingDayType}
              onValueChange={(v) => patch({ bookingDayType: v as BookingDayType })}
            >
              <SelectTrigger
                id="ep-booking-day"
                data-testid="episode-booking-day-type"
                className="h-8 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fix">Fix</SelectItem>
                <SelectItem value="working">Werktag</SelectItem>
                <SelectItem value="ultimo">Ultimo</SelectItem>
                <SelectItem value="sepa">SEPA-Geschäftstag</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              onClick={handleSubmit}
              className="flex-1"
              data-testid="episode-submit"
            >
              {editingId ? 'Speichern' : 'Hinzufügen'}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                data-testid="episode-cancel"
              >
                Abbrechen
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Rule list ───────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Regeln ({rules.length})</h2>
          <Button
            variant="default"
            size="sm"
            onClick={handleGenerate}
            disabled={generating || rules.length === 0}
            data-testid="episode-generate-btn"
            className="gap-2"
          >
            <Play className="h-3.5 w-3.5" />
            Generieren
          </Button>
        </div>

        <ProgressBar
          visible={generating}
          percent={progress}
          onCancel={() => workerProxy.cancel()}
          className="mb-4"
        />

        {!generating && genMsg && (
          <p className="mb-4 text-xs text-muted-foreground" data-testid="episode-gen-result">
            {genMsg}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : rules.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground"
            data-testid="episode-empty"
          >
            <Plus className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Noch keine Regeln.</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="episode-rule-list">
            {rules.map((entry) => {
              const rule = entry.config as EpisodeRule;
              const freqLabel =
                rule.frequency.mode === 'regular'
                  ? 'Regelmäßig'
                  : `Unregelmäßig (${(rule.frequency.probability * 100).toFixed(0)} %)`;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between rounded-lg border bg-card px-4 py-3 ${editingId === entry.id ? 'ring-2 ring-primary' : ''}`}
                  data-testid={`episode-rule-item-${entry.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{rule.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {freqLabel} · {CYCLE_LABEL[rule.cycle]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {rule.categories.map((c) => getCategoryLabel(c)).join(', ')}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(entry)}
                      data-testid={`episode-edit-${entry.id}`}
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(entry)}
                      data-testid={`episode-delete-${entry.id}`}
                      title="Löschen"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Delete confirm modal ───────────────────────────────────────────── */}
      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Regel löschen?"
        description={
          deleteTarget
            ? `Soll die Regel „${(deleteTarget.config as EpisodeRule).name}" wirklich gelöscht werden?`
            : undefined
        }
        confirmLabel="Löschen"
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteRule(deleteTarget.id);
            if (editingId === deleteTarget.id) cancelEdit();
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CYCLE_LABEL: Record<CyclePeriod, string> = {
  monthly: 'Monatlich',
  quarterly: 'Vierteljährlich',
  semiannual: 'Halbjährlich',
  annual: 'Jährlich',
};

export default EpisodischePage;
