/**
 * StreubuchungenPage – ScatterGenerator form (P4b-03 / CLA-55).
 *
 * Features:
 *  - Budget cap, CountConfig (fixed / range), multi-category selection
 *  - Multiple counterparties (comma-separated)
 *  - Rule list with Edit/Delete (ConfirmModal)
 *  - Generate button → WorkerProxy
 *  - Preview: expected/max transaction count (CLA-61)
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
import type { CountConfig, ScatterRule, TransactionType } from '@/domain/types';
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
  countMode: 'fixed' | 'range';
  countFixed: number;
  countMin: number;
  countMax: number;
  budgetPerCycle: number; // 0 = unlimited (Infinity)
}

const DEFAULT_FORM: FormState = {
  name: '',
  counterparties: '',
  purpose: '',
  categories: ['Lebensmittel' as Category],
  transactionType: 'expense',
  amount: { mode: 'fix', amount: 0 },
  countMode: 'fixed',
  countFixed: 5,
  countMin: 3,
  countMax: 10,
  budgetPerCycle: 0,
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
  if (form.countMode === 'fixed' && form.countFixed < 1)
    errors.count = 'Anzahl muss mindestens 1 sein';
  if (form.countMode === 'range' && form.countMin >= form.countMax)
    errors.count = 'Min muss kleiner als Max sein';
  return errors;
}

// ── Preview calculation (CLA-61) ──────────────────────────────────────────────

function calcScatterPreview(
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

  if (form.countMode === 'fixed') {
    const total = form.countFixed * monthsDiff;
    return { expected: total, max: total };
  } else {
    const expected = Math.round(((form.countMin + form.countMax) / 2) * monthsDiff);
    const max = form.countMax * monthsDiff;
    return { expected, max };
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

function StreubuchungenPage() {
  const { rules, loading, addRule, updateRule, deleteRule } = useRules('scatter');
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
    () => calcScatterPreview(form, config.dateFrom, config.dateTo),
    [form, config.dateFrom, config.dateTo],
  );

  const startEdit = useCallback((entry: RuleEntry) => {
    const rule = entry.config as ScatterRule;
    setForm({
      name: rule.name,
      counterparties: rule.counterparties.join(', '),
      purpose: rule.purpose,
      categories: rule.categories,
      transactionType: rule.transactionType,
      amount: rule.amount,
      countMode: rule.count.mode,
      countFixed: rule.count.mode === 'fixed' ? rule.count.count : 5,
      countMin: rule.count.mode === 'range' ? rule.count.min : 3,
      countMax: rule.count.mode === 'range' ? rule.count.max : 10,
      budgetPerCycle: isFinite(rule.budgetPerCycle) ? rule.budgetPerCycle : 0,
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

    const count: CountConfig =
      form.countMode === 'fixed'
        ? { mode: 'fixed', count: form.countFixed }
        : { mode: 'range', min: form.countMin, max: form.countMax };

    const counterparties = form.counterparties
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const rule: ScatterRule = {
      id,
      type: 'scatter',
      enabled: true,
      createdAt: now,
      name: form.name.trim(),
      counterparties,
      purpose: form.purpose.trim(),
      categories: form.categories as [Category, ...Category[]],
      transactionType: form.transactionType,
      amount: form.amount,
      count,
      budgetPerCycle: form.budgetPerCycle > 0 ? form.budgetPerCycle : Infinity,
    };

    const entry: RuleEntry = {
      id: rule.id,
      type: 'scatter',
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
    <div className="flex h-full gap-6 p-6" data-testid="streubuchungen-page">
      {/* ── Left: Form ─────────────────────────────────────────────────────── */}
      <div className="w-96 shrink-0">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          {editingId ? 'Regel bearbeiten' : 'Neue Streubuchungs-Regel'}
        </h2>

        <div className="space-y-4 rounded-lg border bg-card p-4">
          {/* Name */}
          <div>
            <Label htmlFor="sc-name" className="text-xs text-muted-foreground mb-1 block">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sc-name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="z.B. Supermarkt"
              data-testid="scatter-name"
              className={`h-8 text-sm ${errors.name ? 'border-destructive' : ''}`}
            />
            {errors.name && (
              <p className="mt-0.5 text-xs text-destructive" data-testid="scatter-name-error">
                {errors.name}
              </p>
            )}
          </div>

          {/* Transaktionstyp */}
          <div>
            <Label htmlFor="sc-tx-type" className="text-xs text-muted-foreground mb-1 block">
              Transaktionstyp <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.transactionType}
              onValueChange={(v) => patch({ transactionType: v as TransactionType })}
            >
              <SelectTrigger
                id="sc-tx-type"
                data-testid="scatter-transaction-type"
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

          {/* Betrag */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Betrag <span className="text-destructive">*</span>
            </Label>
            <AmountConfigField
              value={form.amount}
              onChange={(a) => patch({ amount: a })}
              testIdPrefix="scatter-amount"
            />
            {errors.amount && <p className="mt-0.5 text-xs text-destructive">{errors.amount}</p>}
          </div>

          {/* CountConfig */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Anzahl pro Monat</Label>
            <div className="flex gap-2 mb-2" data-testid="scatter-count-mode-toggle">
              <Button
                type="button"
                size="sm"
                variant={form.countMode === 'fixed' ? 'default' : 'outline'}
                onClick={() => patch({ countMode: 'fixed' })}
                data-testid="scatter-count-fixed"
                className="flex-1 h-8 text-xs"
              >
                Fest
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.countMode === 'range' ? 'default' : 'outline'}
                onClick={() => patch({ countMode: 'range' })}
                data-testid="scatter-count-range"
                className="flex-1 h-8 text-xs"
              >
                Bereich
              </Button>
            </div>

            {form.countMode === 'fixed' ? (
              <Input
                type="number"
                min={1}
                value={form.countFixed}
                onChange={(e) => patch({ countFixed: parseInt(e.target.value, 10) || 1 })}
                data-testid="scatter-count-fixed-value"
                className="h-8 text-sm"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Min</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.countMin}
                    onChange={(e) => patch({ countMin: parseInt(e.target.value, 10) || 1 })}
                    data-testid="scatter-count-min"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Max</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.countMax}
                    onChange={(e) => patch({ countMax: parseInt(e.target.value, 10) || 1 })}
                    data-testid="scatter-count-max"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            )}
            {errors.count && <p className="mt-0.5 text-xs text-destructive">{errors.count}</p>}
          </div>

          {/* Budget Cap */}
          <div>
            <Label htmlFor="sc-budget" className="text-xs text-muted-foreground mb-1 block">
              Budget / Monat (EUR)
              <span className="ml-1 opacity-60">(0 = unbegrenzt)</span>
            </Label>
            <Input
              id="sc-budget"
              type="number"
              min={0}
              step="0.01"
              value={form.budgetPerCycle}
              onChange={(e) => patch({ budgetPerCycle: parseFloat(e.target.value) || 0 })}
              data-testid="scatter-budget"
              className="h-8 text-sm"
            />
          </div>

          {/* Preview (CLA-61) */}
          {preview && (
            <div
              className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              data-testid="scatter-preview"
            >
              Vorschau: ca. <span className="font-medium text-foreground">{preview.expected}</span>{' '}
              Buchungen
              {form.countMode === 'range' && <> (max. {preview.max})</>}
            </div>
          )}

          {/* Kategorien */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Kategorien <span className="text-destructive">*</span>
            </Label>
            <MultiCategorySelect
              value={form.categories}
              onChange={(cats) => patch({ categories: cats })}
              data-testid="scatter-categories"
            />
            {errors.categories && (
              <p className="mt-0.5 text-xs text-destructive">{errors.categories}</p>
            )}
          </div>

          {/* Gegenkonten */}
          <div>
            <Label htmlFor="sc-counterparties" className="text-xs text-muted-foreground mb-1 block">
              Gegenkonten <span className="text-destructive">*</span>
              <span className="ml-1 opacity-60">(kommagetrennt)</span>
            </Label>
            <Input
              id="sc-counterparties"
              value={form.counterparties}
              onChange={(e) => patch({ counterparties: e.target.value })}
              placeholder="z.B. Aldi, Rewe, Lidl"
              data-testid="scatter-counterparties"
              className={`h-8 text-sm ${errors.counterparties ? 'border-destructive' : ''}`}
            />
            {errors.counterparties && (
              <p className="mt-0.5 text-xs text-destructive">{errors.counterparties}</p>
            )}
          </div>

          {/* Verwendungszweck */}
          <div>
            <Label htmlFor="sc-purpose" className="text-xs text-muted-foreground mb-1 block">
              Verwendungszweck <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sc-purpose"
              value={form.purpose}
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder="z.B. Einkauf {n}"
              data-testid="scatter-purpose"
              className={`h-8 text-sm ${errors.purpose ? 'border-destructive' : ''}`}
            />
            {errors.purpose && <p className="mt-0.5 text-xs text-destructive">{errors.purpose}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              onClick={handleSubmit}
              className="flex-1"
              data-testid="scatter-submit"
            >
              {editingId ? 'Speichern' : 'Hinzufügen'}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                data-testid="scatter-cancel"
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
            data-testid="scatter-generate-btn"
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
          <p className="mb-4 text-xs text-muted-foreground" data-testid="scatter-gen-result">
            {genMsg}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : rules.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground"
            data-testid="scatter-empty"
          >
            <Plus className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Noch keine Regeln.</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="scatter-rule-list">
            {rules.map((entry) => {
              const rule = entry.config as ScatterRule;
              const countLabel =
                rule.count.mode === 'fixed'
                  ? `${rule.count.count}×/Monat`
                  : `${rule.count.min}–${rule.count.max}×/Monat`;
              const budgetLabel = isFinite(rule.budgetPerCycle)
                ? ` · max. ${rule.budgetPerCycle.toFixed(2)} €`
                : '';
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between rounded-lg border bg-card px-4 py-3 ${editingId === entry.id ? 'ring-2 ring-primary' : ''}`}
                  data-testid={`scatter-rule-item-${entry.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{rule.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {countLabel}
                      {budgetLabel}
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
                      data-testid={`scatter-edit-${entry.id}`}
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(entry)}
                      data-testid={`scatter-delete-${entry.id}`}
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
            ? `Soll die Regel „${(deleteTarget.config as ScatterRule).name}" wirklich gelöscht werden?`
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

export default StreubuchungenPage;
