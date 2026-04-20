import { useState } from 'react';
import { isBefore, parseISO, isValid } from 'date-fns';
import { RefreshCw, Server } from 'lucide-react';
import {
  getApiKey,
  getApiUrl,
  setApiKey as storeApiKey,
  setApiUrl as storeApiUrl,
  DEFAULT_API_URL,
} from '@/infrastructure/api/apiKeyStorage';
import { useAppConfigStore, selectConfig } from '@/ui/stores/appConfig';
import { ConfirmModal } from '@/ui/components/confirm-modal';
import { Button } from '@/ui/components/button';
import { Input } from '@/ui/components/input';
import { Label } from '@/ui/components/label';
import { cn } from '@/lib/utils';

// ── Bundesland options ────────────────────────────────────────────────────────

const BUNDESLAENDER: { value: string; label: string }[] = [
  { value: 'DE-BB', label: 'Brandenburg' },
  { value: 'DE-BE', label: 'Berlin' },
  { value: 'DE-BW', label: 'Baden-Württemberg' },
  { value: 'DE-BY', label: 'Bayern' },
  { value: 'DE-HB', label: 'Bremen' },
  { value: 'DE-HE', label: 'Hessen' },
  { value: 'DE-HH', label: 'Hamburg' },
  { value: 'DE-MV', label: 'Mecklenburg-Vorpommern' },
  { value: 'DE-NI', label: 'Niedersachsen' },
  { value: 'DE-NW', label: 'Nordrhein-Westfalen' },
  { value: 'DE-RP', label: 'Rheinland-Pfalz' },
  { value: 'DE-SH', label: 'Schleswig-Holstein' },
  { value: 'DE-SL', label: 'Saarland' },
  { value: 'DE-SN', label: 'Sachsen' },
  { value: 'DE-ST', label: 'Sachsen-Anhalt' },
  { value: 'DE-TH', label: 'Thüringen' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(iso: string): Date | undefined {
  const d = parseISO(iso);
  return isValid(d) ? d : undefined;
}

// ── DatePickerField ───────────────────────────────────────────────────────────

interface DatePickerFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  error?: string;
}

function DatePickerField({ id, label, value, onChange, min, error }: DatePickerFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`config-panel-${id}`}
        className={cn('font-mono', error && 'border-destructive')}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── TimeField ─────────────────────────────────────────────────────────────────

interface TimeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  error?: string;
}

function TimeField({ id, label, value, onChange, error }: TimeFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`config-panel-${id}`}
        className={cn('font-mono', error && 'border-destructive')}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── ConfigPanel ───────────────────────────────────────────────────────────────

export function ConfigPanel() {
  const config = useAppConfigStore(selectConfig);
  const setConfig = useAppConfigStore((s) => s.setConfig);
  const resetConfig = useAppConfigStore((s) => s.resetConfig);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Validation: ZR-07 – Start < Ende
  const dateFromDate = toDate(config.dateFrom);
  const dateToDate = toDate(config.dateTo);
  const dateError: string | undefined =
    dateFromDate && dateToDate && !isBefore(dateFromDate, dateToDate)
      ? 'Startdatum muss vor dem Enddatum liegen (ZR-07)'
      : undefined;

  const timeError: string | undefined = (() => {
    const [fh, fm] = config.timeFrom.split(':').map(Number);
    const [th, tm] = config.timeTo.split(':').map(Number);
    return fh * 60 + fm >= th * 60 + tm ? 'Startzeit muss vor der Endzeit liegen' : undefined;
  })();

  const isValidConfig = !dateError && !timeError;

  // API settings – stored in localStorage, NOT in React state (P6-05 requirement)
  const [apiUrl, setApiUrlLocal] = useState(() => getApiUrl());
  const [apiKey, setApiKeyLocal] = useState(() => getApiKey());

  const handleApiUrlChange = (url: string) => {
    setApiUrlLocal(url);
    storeApiUrl(url);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKeyLocal(key);
    storeApiKey(key);
  };

  return (
    <div className="h-full overflow-y-auto" data-testid="config-panel">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Konfiguration</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Globale Parameter für die Transaktionsgenerierung
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetModalOpen(true)}
            data-testid="config-panel-reset-btn"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Zurücksetzen
          </Button>
        </div>

        {/* Date range – ZR-01 / ZR-02 */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Zeitraum (ZR-01 / ZR-02)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <DatePickerField
              id="start-date"
              label="Startdatum"
              value={config.dateFrom}
              onChange={(v) => setConfig({ dateFrom: v })}
              error={dateError}
            />
            <DatePickerField
              id="end-date"
              label="Enddatum"
              value={config.dateTo}
              onChange={(v) => setConfig({ dateTo: v })}
              min={config.dateFrom}
              error={dateError ? ' ' : undefined}
            />
          </div>
          {dateError && (
            <p className="text-xs text-destructive" role="alert" data-testid="config-date-error">
              {dateError}
            </p>
          )}
        </section>

        {/* Time range – ZR-03 / ZR-04 */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Tageszeit (ZR-03 / ZR-04)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <TimeField
              id="start-time"
              label="Startzeit"
              value={config.timeFrom}
              onChange={(v) => setConfig({ timeFrom: v })}
              error={timeError}
            />
            <TimeField
              id="end-time"
              label="Endzeit"
              value={config.timeTo}
              onChange={(v) => setConfig({ timeTo: v })}
              error={timeError ? ' ' : undefined}
            />
          </div>
          {timeError && (
            <p className="text-xs text-destructive" role="alert" data-testid="config-time-error">
              {timeError}
            </p>
          )}
        </section>

        {/* Zahlungsmodus – ZR-05 */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Zahlungsmodus (ZR-05)
          </h3>
          <div className="flex gap-2">
            {(['sepa', 'instant'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={config.paymentMode === mode}
                onClick={() => setConfig({ paymentMode: mode })}
                data-testid={`config-panel-payment-mode-${mode}`}
                className={cn(
                  'flex-1 rounded-md border py-2.5 text-sm font-medium transition-colors',
                  config.paymentMode === mode
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {mode === 'sepa' ? 'SEPA' : 'Instant'}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {config.paymentMode === 'sepa'
              ? 'SEPA: Buchungen nur an Werktagen (gemäß Bundesland-Kalender)'
              : 'Instant: Buchungen an allen Tagen inkl. Wochenenden und Feiertagen'}
          </p>
        </section>

        {/* Bundesland – AT-04 */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Bundesland (AT-04)
          </h3>
          <div className="space-y-1.5">
            <Label htmlFor="bundesland">Bundesland für Feiertagskalender</Label>
            <select
              id="bundesland"
              data-testid="config-panel-bundesland"
              value={config.bundesland}
              onChange={(e) => setConfig({ bundesland: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {BUNDESLAENDER.map((bl) => (
                <option
                  key={bl.value}
                  value={bl.value}
                  data-testid={`config-bundesland-option-${bl.value}`}
                >
                  {bl.label} ({bl.value})
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Seed – E-03 */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Seed (E-03)
          </h3>
          <div className="space-y-1.5">
            <Label htmlFor="seed">PRNG-Seed (leer = zufällig)</Label>
            <Input
              id="seed"
              type="number"
              placeholder="Seed-Wert (optional)"
              value={config.seed ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setConfig({ seed: v === '' ? null : parseInt(v, 10) });
              }}
              data-testid="config-panel-seed"
              className="font-mono-nums w-48"
            />
            <p className="text-xs text-muted-foreground">
              Mit Seed wird eine deterministische, reproduzierbare Ausgabe erzeugt.
            </p>
          </div>
        </section>

        {/* API-Verbindung – P6-05 */}
        <section className="space-y-4" data-testid="api-settings-section">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            API-Verbindung (P6-05)
          </h3>
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Server-URL und API-Schlüssel werden lokal gespeichert und nie an den State übergeben.
              Leer lassen wenn kein Backend verwendet wird.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="api-url">Server-URL</Label>
              <Input
                id="api-url"
                type="url"
                placeholder={DEFAULT_API_URL}
                value={apiUrl}
                onChange={(e) => handleApiUrlChange(e.target.value)}
                data-testid="config-api-url"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-key">API-Schlüssel</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Bearer-Token (64-stellig)"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                data-testid="config-api-key"
                className="font-mono text-sm"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Wird im localStorage gespeichert. Nicht im Zustand oder in Backups enthalten.
              </p>
            </div>
          </div>
        </section>

        {/* Validation summary */}
        {!isValidConfig && (
          <div
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3"
            data-testid="config-validation-summary"
          >
            <p className="text-sm text-destructive font-medium">
              Bitte korrigieren Sie die Fehler, bevor Sie eine Generierung starten.
            </p>
          </div>
        )}
      </div>

      {/* Reset confirmation modal */}
      <ConfirmModal
        open={resetModalOpen}
        onOpenChange={setResetModalOpen}
        title="Konfiguration zurücksetzen?"
        description="Alle Einstellungen werden auf die Standardwerte zurückgesetzt."
        onConfirm={() => {
          resetConfig();
          setResetModalOpen(false);
        }}
      />
    </div>
  );
}
