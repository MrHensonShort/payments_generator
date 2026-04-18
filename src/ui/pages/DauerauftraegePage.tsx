/**
 * DauerauftraegePage – RecurringGenerator form (P4b-01 / CLA-53).
 *
 * Features:
 *  - Create / edit a RecurringRule with all required fields
 *  - Rule list with Edit and Delete buttons
 *  - Delete uses ConfirmModal
 *  - Full field validation for mandatory fields
 *  - Generate button triggers WorkerProxy (P4b-04)
 *  - data-testid attributes on all interactive elements
 */
import { useState, useCallback } from 'react';
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
import { ProgressBar } from '@/ui/components/progress-bar';
import { useRules } from '@/ui/hooks/useRules';
import { useAppConfigStore, selectConfig } from '@/ui/stores/appConfig';
import { workerProxy } from '@/ui/WorkerProxy';
import type { AmountConfig } from '@/domain/AmountCalculator';
import type { BookingDayType, CyclePeriod, RecurringRule, TransactionType } from '@/domain/types';
import { ALL_CATEGORIES, getCategoryLabel, type Category } from '@/domain/category/categoryEnum';
import type { RuleEntry } from '@/infrastructure/database';

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  counterparty: string;
  purpose: string;
  category: Category;
  transactionType: TransactionType;
  amount: AmountConfig;
  cycle: CyclePeriod;
  dayOfMonth: number;
  bookingDayType: BookingDayType;
}

const DEFAULT_FORM: FormState = {
  name: '',
  counterparty: '',
  purpose: '',
  category: 'Gehalt' as Category,
  transactionType: 'expense',
  amount: { mode: 'fix', amount: 0 },
  cycle: 'monthly',
  dayOfMonth: 1,
  bookingDayType: 'fix',
};

// ── Validation ─────────────────────────────────────────────────────────────────

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Name ist erforderlich';
  if (!form.counterparty.trim()) errors.counterparty = 'Gegenkonto ist erforderlich';
  if (!form.purpose.trim()) errors.purpose = 'Verwendungszweck ist erforderlich';
  if (!form.category) errors.category = 'Kategorie ist erforderlich';
  if (form.amount.mode === 'fix' && form.amount.amount === 0)
    errors.amount = 'Betrag darf nicht 0 sein';
  if (form.amount.mode === 'range' && form.amount.min >= form.amount.max)
    errors.amount = 'Min muss kleiner als Max sein';
  if (form.dayOfMonth < 1 || form.dayOfMonth > 31)
    errors.dayOfMonth = 'Tag muss zwischen 1 und 31 liegen';
  return errors;
}

// ── Component ──────────────────────────────────────────────────────────────────

function DauerauftraegePage() {
  const { rules, loading, addRule, updateRule, deleteRule } = useRules('recurring');
  const config = useAppConfigStore(selectConfig);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<RuleEntry | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [genMsg, setGenMsg] = useState('');

  const patch = (partial: Partial<FormState>) => setForm((f) => ({ ...f, ...partial }));

  const startEdit = useCallback((entry: RuleEntry) => {
    const rule = entry.config as RecurringRule;
    setForm({
      name: rule.name,
      counterparty: rule.counterparty,
      purpose: rule.purpose,
      category: rule.category,
      transactionType: rule.transactionType,
      amount: rule.amount,
      cycle: rule.cycle,
      dayOfMonth: rule.dayOfMonth,
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
    const rule: RecurringRule = {
      id,
      type: 'recurring',
      enabled: true,
      createdAt: now,
      name: form.name.trim(),
      counterparty: form.counterparty.trim(),
      purpose: form.purpose.trim(),
      category: form.category,
      transactionType: form.transactionType,
      amount: form.amount,
      cycle: form.cycle,
      dayOfMonth: form.dayOfMonth,
      bookingDayType: form.bookingDayType,
    };

    const entry: RuleEntry = {
      id: rule.id,
      type: 'recurring',
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
    <div className="flex h-full gap-6 p-6" data-testid="dauerauftraege-page">
      {/* ── Left: Form ─────────────────────────────────────────────────────── */}
      <div className="w-96 shrink-0">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          {editingId ? 'Regel bearbeiten' : 'Neue Dauerauftrag-Regel'}
        </h2>

        <div className="space-y-4 rounded-lg border bg-card p-4">
          {/* Name */}
          <div>
            <Label htmlFor="rec-name" className="text-xs text-muted-foreground mb-1 block">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rec-name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="z.B. Miete"
              data-testid="recurring-name"
              className={`h-8 text-sm ${errors.name ? 'border-destructive' : ''}`}
            />
            {errors.name && (
              <p className="mt-0.5 text-xs text-destructive" data-testid="recurring-name-error">
                {errors.name}
              </p>
            )}
          </div>

          {/* Transaktionstyp */}
          <div>
            <Label htmlFor="rec-tx-type" className="text-xs text-muted-foreground mb-1 block">
              Transaktionstyp <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.transactionType}
              onValueChange={(v) => patch({ transactionType: v as TransactionType })}
            >
              <SelectTrigger
                id="rec-tx-type"
                data-testid="recurring-transaction-type"
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
              testIdPrefix="recurring-amount"
            />
            {errors.amount && (
              <p className="mt-0.5 text-xs text-destructive" data-testid="recurring-amount-error">
                {errors.amount}
              </p>
            )}
          </div>

          {/* Kategorie */}
          <div>
            <Label htmlFor="rec-category" className="text-xs text-muted-foreground mb-1 block">
              Kategorie <span className="text-destructive">*</span>
            </Label>
            <Select value={form.category} onValueChange={(v) => patch({ category: v as Category })}>
              <SelectTrigger
                id="rec-category"
                data-testid="recurring-category"
                className={`h-8 text-sm ${errors.category ? 'border-destructive' : ''}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="mt-0.5 text-xs text-destructive">{errors.category}</p>
            )}
          </div>

          {/* Gegenkonto */}
          <div>
            <Label htmlFor="rec-counterparty" className="text-xs text-muted-foreground mb-1 block">
              Gegenkonto <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rec-counterparty"
              value={form.counterparty}
              onChange={(e) => patch({ counterparty: e.target.value })}
              placeholder="z.B. Vermietungsgesellschaft GmbH"
              data-testid="recurring-counterparty"
              className={`h-8 text-sm ${errors.counterparty ? 'border-destructive' : ''}`}
            />
            {errors.counterparty && (
              <p
                className="mt-0.5 text-xs text-destructive"
                data-testid="recurring-counterparty-error"
              >
                {errors.counterparty}
              </p>
            )}
          </div>

          {/* Verwendungszweck */}
          <div>
            <Label htmlFor="rec-purpose" className="text-xs text-muted-foreground mb-1 block">
              Verwendungszweck <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rec-purpose"
              value={form.purpose}
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder="z.B. Miete Monat {n}"
              data-testid="recurring-purpose"
              className={`h-8 text-sm ${errors.purpose ? 'border-destructive' : ''}`}
            />
            {errors.purpose && (
              <p className="mt-0.5 text-xs text-destructive" data-testid="recurring-purpose-error">
                {errors.purpose}
              </p>
            )}
          </div>

          {/* Zyklus + Tag */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="rec-cycle" className="text-xs text-muted-foreground mb-1 block">
                Zyklus
              </Label>
              <Select value={form.cycle} onValueChange={(v) => patch({ cycle: v as CyclePeriod })}>
                <SelectTrigger id="rec-cycle" data-testid="recurring-cycle" className="h-8 text-sm">
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
            <div>
              <Label htmlFor="rec-day" className="text-xs text-muted-foreground mb-1 block">
                Tag (1–31)
              </Label>
              <Input
                id="rec-day"
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(e) => patch({ dayOfMonth: parseInt(e.target.value, 10) || 1 })}
                data-testid="recurring-day-of-month"
                className={`h-8 text-sm ${errors.dayOfMonth ? 'border-destructive' : ''}`}
              />
            </div>
          </div>

          {/* Buchungstagtyp */}
          <div>
            <Label htmlFor="rec-booking-day" className="text-xs text-muted-foreground mb-1 block">
              Buchungstagtyp
            </Label>
            <Select
              value={form.bookingDayType}
              onValueChange={(v) => patch({ bookingDayType: v as BookingDayType })}
            >
              <SelectTrigger
                id="rec-booking-day"
                data-testid="recurring-booking-day-type"
                className="h-8 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fix">Fix (exakter Kalendertag)</SelectItem>
                <SelectItem value="working">Werktag (nächster)</SelectItem>
                <SelectItem value="ultimo">Ultimo (Monatsende)</SelectItem>
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
              data-testid="recurring-submit"
            >
              {editingId ? 'Speichern' : 'Hinzufügen'}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                data-testid="recurring-cancel"
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
            data-testid="recurring-generate-btn"
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
          <p className="mb-4 text-xs text-muted-foreground" data-testid="recurring-gen-result">
            {genMsg}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : rules.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground"
            data-testid="recurring-empty"
          >
            <Plus className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Noch keine Regeln. Erstelle deine erste Dauerauftrag-Regel.</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="recurring-rule-list">
            {rules.map((entry) => {
              const rule = entry.config as RecurringRule;
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between rounded-lg border bg-card px-4 py-3 ${editingId === entry.id ? 'ring-2 ring-primary' : ''}`}
                  data-testid={`recurring-rule-item-${entry.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{rule.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {CYCLE_LABEL[rule.cycle]} · {rule.counterparty} ·{' '}
                      {getCategoryLabel(rule.category)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatAmount(rule.amount)} · Tag {rule.dayOfMonth}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(entry)}
                      data-testid={`recurring-edit-${entry.id}`}
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(entry)}
                      data-testid={`recurring-delete-${entry.id}`}
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
            ? `Soll die Regel „${(deleteTarget.config as RecurringRule).name}" wirklich gelöscht werden?`
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

function formatAmount(amount: AmountConfig): string {
  if (amount.mode === 'fix') return `${amount.amount.toFixed(2)} €`;
  if (amount.mode === 'range') return `${amount.min.toFixed(2)} – ${amount.max.toFixed(2)} €`;
  return `${amount.base.toFixed(2)} € ±${amount.variance}%`;
}

export default DauerauftraegePage;
