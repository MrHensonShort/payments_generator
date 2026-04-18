import { useState, useRef, useCallback } from 'react';
import {
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  FileJson,
  FileText,
} from 'lucide-react';
import { Button } from '@/ui/components/button';
import { Label } from '@/ui/components/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/ui/components/select';
import { ConfirmModal } from '@/ui/components/confirm-modal';
import { db } from '@/infrastructure/database';
import { TransactionRepo } from '@/infrastructure/transactionRepo';
import { RuleRepo } from '@/infrastructure/ruleRepo';
import type { TransactionEntry, RuleEntry } from '@/infrastructure/database';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_ERRORS_SHOWN = 10;

const txRepo = new TransactionRepo(db);
const ruleRepo = new RuleRepo(db);

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportError {
  line: number;
  description: string;
}

interface BackupPayload {
  version: number;
  exportedAt: string;
  transactions?: TransactionEntry[];
  rules?: RuleEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCsv(transactions: TransactionEntry[], delimiter: string): void {
  // German display headers as expected by E2E spec (Datum, Betrag, Verwendungszweck, Gegenkonto).
  const headers = [
    'Datum',
    'Uhrzeit',
    'Betrag',
    'Verwendungszweck',
    'Gegenkonto',
    'Kategorie',
    'Quelle',
    'RegelId',
    'Id',
  ];
  const rows = transactions.map((tx) => [
    tx.date,
    tx.time,
    tx.amount.toFixed(2).replace('.', ','),
    tx.purpose,
    tx.counterparty,
    tx.category,
    tx.source,
    tx.ruleId ?? '',
    tx.id,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(delimiter))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `transaktionen_${new Date().toISOString().split('T')[0]}.csv`);
}

function exportJson(data: object, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function validateBackup(obj: unknown): { errors: ImportError[]; payload?: BackupPayload } {
  const errors: ImportError[] = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { errors: [{ line: 1, description: 'Ungültiges Backup-Format: JSON-Objekt erwartet' }] };
  }

  const raw = obj as Record<string, unknown>;

  let transactions: TransactionEntry[] | undefined;
  if (raw.transactions !== undefined) {
    if (!Array.isArray(raw.transactions)) {
      errors.push({ line: 1, description: '"transactions" muss ein Array sein' });
    } else {
      transactions = [];
      raw.transactions.forEach((tx, idx) => {
        const line = idx + 1;
        if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
          errors.push({ line, description: `Transaktion ${line}: Objekt erwartet` });
          return;
        }
        const t = tx as Record<string, unknown>;
        const missing: string[] = [];
        if (typeof t.id !== 'string') missing.push('id');
        if (typeof t.date !== 'string') missing.push('date');
        if (typeof t.time !== 'string') missing.push('time');
        if (typeof t.amount !== 'number') missing.push('amount (Zahl)');
        if (typeof t.purpose !== 'string') missing.push('purpose');
        if (typeof t.counterparty !== 'string') missing.push('counterparty');
        if (typeof t.category !== 'string') missing.push('category');
        if (typeof t.source !== 'string') missing.push('source');
        if (missing.length > 0) {
          errors.push({
            line,
            description: `Transaktion ${line}: Fehlende/falsche Felder: ${missing.join(', ')}`,
          });
        } else {
          transactions!.push(t as unknown as TransactionEntry);
        }
      });
    }
  }

  let rules: RuleEntry[] | undefined;
  if (raw.rules !== undefined) {
    if (!Array.isArray(raw.rules)) {
      errors.push({ line: 1, description: '"rules" muss ein Array sein' });
    } else {
      rules = [];
      raw.rules.forEach((rule, idx) => {
        const line = idx + 1;
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
          errors.push({ line, description: `Regel ${line}: Objekt erwartet` });
          return;
        }
        const r = rule as Record<string, unknown>;
        const missing: string[] = [];
        if (typeof r.id !== 'string') missing.push('id');
        if (!['recurring', 'episode', 'scatter'].includes(r.type as string)) missing.push('type');
        if (typeof r.name !== 'string') missing.push('name');
        if (typeof r.createdAt !== 'string') missing.push('createdAt');
        if (missing.length > 0) {
          errors.push({
            line,
            description: `Regel ${line}: Fehlende/falsche Felder: ${missing.join(', ')}`,
          });
        } else {
          rules!.push(r as unknown as RuleEntry);
        }
      });
    }
  }

  if (transactions === undefined && rules === undefined) {
    errors.push({
      line: 1,
      description: 'Backup enthält weder "transactions" noch "rules"',
    });
  }

  if (errors.length > 0) return { errors };
  return {
    errors: [],
    payload: {
      version: typeof raw.version === 'number' ? raw.version : 1,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      transactions,
      rules,
    },
  };
}

// ── ErrorToast ────────────────────────────────────────────────────────────────

interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

function ErrorToast({ message, onClose }: ErrorToastProps) {
  return (
    <div
      data-testid="import-error-toast"
      role="alert"
      className="fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 shadow-lg max-w-sm"
    >
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <p className="flex-1 text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-destructive/70 hover:text-destructive transition-colors"
        aria-label="Toast schließen"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── ImportErrorList ────────────────────────────────────────────────────────────

interface ImportErrorListProps {
  errors: ImportError[];
}

function ImportErrorList({ errors }: ImportErrorListProps) {
  if (errors.length === 0) return null;
  const visible = errors.slice(0, MAX_ERRORS_SHOWN);
  const extra = errors.length - MAX_ERRORS_SHOWN;

  return (
    <div
      data-testid="import-error-list"
      role="alert"
      aria-label={`${errors.length} Importfehler`}
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-1"
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <p className="text-sm font-semibold text-destructive">
          {errors.length === 1 ? '1 Fehler gefunden' : `${errors.length} Fehler gefunden`}
        </p>
      </div>
      <ul className="space-y-1">
        {visible.map((err, idx) => (
          <li key={idx} className="flex items-start gap-2 text-xs text-destructive">
            <span className="shrink-0 font-mono text-destructive/70 min-w-[3.5rem]">
              Zeile {err.line}
            </span>
            <span>{err.description}</span>
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <p className="text-xs text-destructive/70 pt-1 border-t border-destructive/20">
          … und {extra} weitere {extra === 1 ? 'Fehler' : 'Fehler'}
        </p>
      )}
    </div>
  );
}

// ── BackupExportPage ──────────────────────────────────────────────────────────

function BackupExportPage() {
  // CSV Export
  const [csvDelimiter, setCsvDelimiter] = useState(';');
  const [csvExporting, setCsvExporting] = useState(false);

  // JSON Backup export
  const [jsonExporting, setJsonExporting] = useState<'transactions' | 'rules' | 'all' | null>(null);

  // Import – 2-step flow: select file → import-btn becomes enabled → click to import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importing, setImporting] = useState(false);

  // Toast (50 MB check or other immediate notifications)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DB Maintenance confirm modals
  const [confirmDeleteTx, setConfirmDeleteTx] = useState(false);
  const [confirmDeleteRules, setConfirmDeleteRules] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // ── CSV Export ─────────────────────────────────────────────────────────────

  const handleCsvExport = useCallback(async () => {
    setCsvExporting(true);
    try {
      const txs = await txRepo.getAll();
      // Show toast when no transactions – no file download (E2E spec).
      if (txs.length === 0) {
        showToast('Keine Transaktionen vorhanden – nichts zu exportieren.');
        return;
      }
      exportCsv(txs, csvDelimiter);
    } finally {
      setCsvExporting(false);
    }
  }, [csvDelimiter, showToast]);

  // ── JSON Backup export ─────────────────────────────────────────────────────

  const handleExportTransactions = useCallback(async () => {
    setJsonExporting('transactions');
    try {
      const transactions = await txRepo.getAll();
      exportJson(
        { version: 1, exportedAt: new Date().toISOString(), transactions },
        `transactions_backup_${new Date().toISOString().split('T')[0]}.json`,
      );
    } finally {
      setJsonExporting(null);
    }
  }, []);

  const handleExportRules = useCallback(async () => {
    setJsonExporting('rules');
    try {
      const rules = await ruleRepo.getAll();
      exportJson(
        { version: 1, exportedAt: new Date().toISOString(), rules },
        `rules_backup_${new Date().toISOString().split('T')[0]}.json`,
      );
    } finally {
      setJsonExporting(null);
    }
  }, []);

  // Full backup (export-all-btn) – used by E2E roundtrip tests.
  const handleExportAll = useCallback(async () => {
    setJsonExporting('all');
    try {
      const [transactions, rules] = await Promise.all([txRepo.getAll(), ruleRepo.getAll()]);
      exportJson(
        { version: 1, exportedAt: new Date().toISOString(), transactions, rules },
        `backup_${new Date().toISOString().split('T')[0]}.json`,
      );
    } finally {
      setJsonExporting(null);
    }
  }, []);

  // ── Import (2-step: select file → click import-btn) ────────────────────────

  const runImport = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportErrors([]);
      setImportSuccess(false);

      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          setImportErrors([
            { line: 1, description: `JSON-Syntaxfehler: ${(err as Error).message}` },
          ]);
          return;
        }

        const { errors, payload } = validateBackup(parsed);
        if (errors.length > 0) {
          setImportErrors(errors);
          return;
        }

        if (!payload) return;

        if (importMode === 'replace') {
          if (payload.transactions) await txRepo.clearAll();
          if (payload.rules) await ruleRepo.clearAll();
        }

        if (payload.transactions) {
          for (const tx of payload.transactions) {
            try {
              await txRepo.add(tx);
            } catch {
              // Skip duplicate keys in merge mode
            }
          }
        }

        if (payload.rules) {
          for (const rule of payload.rules) {
            try {
              await ruleRepo.add(rule);
            } catch {
              // Skip duplicate keys in merge mode
            }
          }
        }

        setImportSuccess(true);
        setImportErrors([]); // Clear errors on success (CLA-66 acceptance criterion)
      } catch (err) {
        setImportErrors([{ line: 0, description: `Importfehler: ${(err as Error).message}` }]);
      } finally {
        setImporting(false);
        // Reset file input so the same file can be re-selected if needed.
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [importMode],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setImportErrors([]);
      setImportSuccess(false);
      setPendingFile(null);

      if (!file) return;

      // 50 MB check – synchronous setState → toast appears < 200 ms (CLA-66 requirement).
      if (file.size > MAX_FILE_SIZE_BYTES) {
        e.target.value = '';
        showToast(`Datei zu groß: ${(file.size / 1024 / 1024).toFixed(1)} MB (Maximum: 50 MB)`);
        return;
      }

      // Store file; import starts only when import-btn is clicked.
      setPendingFile(file);
    },
    [showToast],
  );

  const handleImportBtnClick = useCallback(async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await runImport(file);
  }, [pendingFile, runImport]);

  // ── DB Maintenance ─────────────────────────────────────────────────────────

  const handleDeleteAllTransactions = useCallback(async () => {
    await txRepo.clearAll();
    setConfirmDeleteTx(false);
  }, []);

  const handleDeleteAllRules = useCallback(async () => {
    await ruleRepo.clearAll();
    setConfirmDeleteRules(false);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto" data-testid="backup-restore-panel">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-foreground">Backup &amp; Export</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daten exportieren, importieren und Datenbank verwalten
          </p>
        </div>

        {/* ── CSV-Export ── */}
        <section className="space-y-4" data-testid="csv-export-section">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            CSV-Export
          </h3>
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="csv-delimiter">Trennzeichen</Label>
              <Select value={csvDelimiter} onValueChange={setCsvDelimiter}>
                <SelectTrigger
                  id="csv-delimiter"
                  data-testid="csv-delimiter-select"
                  className="w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=";" data-testid="csv-delimiter-semicolon">
                    Semikolon (;)
                  </SelectItem>
                  <SelectItem value="," data-testid="csv-delimiter-comma">
                    Komma (,)
                  </SelectItem>
                  <SelectItem value={'\t'} data-testid="csv-delimiter-tab">
                    Tabulator (\t)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Kodierung: UTF-8 mit BOM</p>
            </div>
            <Button
              onClick={handleCsvExport}
              disabled={csvExporting}
              data-testid="csv-export-btn"
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              {csvExporting ? 'Exportiere…' : 'Transaktionen als CSV exportieren'}
            </Button>
          </div>
        </section>

        {/* ── JSON-Backup ── */}
        <section className="space-y-4" data-testid="json-backup-section">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            JSON-Backup
          </h3>
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Exportiere Transaktionen und/oder Regeln als JSON-Backup zur Wiederherstellung.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleExportTransactions}
                disabled={jsonExporting !== null}
                data-testid="export-transactions-btn"
                className="gap-2"
              >
                <FileJson className="h-4 w-4" />
                {jsonExporting === 'transactions' ? 'Exportiere…' : 'Transaktionen'}
              </Button>
              <Button
                variant="outline"
                onClick={handleExportRules}
                disabled={jsonExporting !== null}
                data-testid="export-rules-btn"
                className="gap-2"
              >
                <FileJson className="h-4 w-4" />
                {jsonExporting === 'rules' ? 'Exportiere…' : 'Regeln'}
              </Button>
              {/* export-all-btn – full backup used by E2E roundtrip tests. */}
              <Button
                onClick={handleExportAll}
                disabled={jsonExporting !== null}
                data-testid="export-all-btn"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {jsonExporting === 'all' ? 'Exportiere…' : 'Vollständiges Backup'}
              </Button>
            </div>
          </div>
        </section>

        {/* ── Wiederherstellen (Import) ── */}
        <section className="space-y-4" data-testid="restore-section">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Wiederherstellen (Import)
          </h3>
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            {/* Import-Modus */}
            <div className="space-y-1.5">
              <Label>Import-Modus</Label>
              <div className="flex gap-2">
                {(['merge', 'replace'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setImportMode(mode)}
                    data-testid={`import-mode-${mode}`}
                    className={cn(
                      'flex-1 rounded-md border py-2 text-sm font-medium transition-colors',
                      importMode === mode
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {mode === 'merge' ? 'Zusammenführen' : 'Ersetzen'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {importMode === 'merge'
                  ? 'Vorhandene Daten bleiben erhalten; neue Einträge werden hinzugefügt.'
                  : 'Vorhandene Daten werden vor dem Import gelöscht.'}
              </p>
            </div>

            {/* Hidden file input (import-file-input).
                2-step flow: select file → import-btn becomes enabled → click to import. */}
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              data-testid="import-file-input"
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {pendingFile ? pendingFile.name : 'Backup-Datei auswählen…'}
              </Button>
              <Button
                onClick={handleImportBtnClick}
                disabled={!pendingFile || importing}
                data-testid="import-btn"
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {importing ? 'Importiere…' : 'Importieren'}
              </Button>
            </div>

            {/* Erfolgsmeldung (import-success) */}
            {importSuccess && (
              <div
                data-testid="import-success"
                role="status"
                className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
              >
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-sm text-emerald-500">Import erfolgreich abgeschlossen.</p>
              </div>
            )}

            {/* Fehlerliste (CLA-66 / P5-04): data-testid="import-error-list" */}
            <ImportErrorList errors={importErrors} />
          </div>
        </section>

        {/* ── Datenbank-Wartung ── */}
        <section className="space-y-4" data-testid="db-maintenance-section">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Datenbank-Wartung
          </h3>
          <div className="rounded-lg border border-destructive/30 bg-card p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Destruktive Aktionen – diese können nicht rückgängig gemacht werden.
            </p>
            <div className="flex flex-wrap gap-2">
              {/* DB-04: Alle Transaktionen löschen */}
              <Button
                variant="destructive"
                onClick={() => setConfirmDeleteTx(true)}
                data-testid="delete-all-transactions-btn"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Alle Transaktionen löschen
              </Button>
              {/* DB-10: Alle Regeln löschen */}
              <Button
                variant="destructive"
                onClick={() => setConfirmDeleteRules(true)}
                data-testid="delete-all-rules-btn"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Alle Regeln löschen
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* 50 MB / Fehler-Toast (CLA-66 / P5-04): data-testid="import-error-toast" */}
      {toast && <ErrorToast message={toast} onClose={() => setToast(null)} />}

      {/* Bestätigungs-Modals (DB-04 / DB-10) */}
      <ConfirmModal
        open={confirmDeleteTx}
        onOpenChange={setConfirmDeleteTx}
        title="Alle Transaktionen löschen?"
        description="Diese Aktion löscht alle generierten Transaktionen unwiderruflich. Die Regeln bleiben erhalten."
        confirmLabel="Alle löschen"
        onConfirm={handleDeleteAllTransactions}
      />
      <ConfirmModal
        open={confirmDeleteRules}
        onOpenChange={setConfirmDeleteRules}
        title="Alle Regeln löschen?"
        description="Diese Aktion löscht alle gespeicherten Regeln unwiderruflich. Bereits generierte Transaktionen bleiben erhalten."
        confirmLabel="Alle löschen"
        onConfirm={handleDeleteAllRules}
      />
    </div>
  );
}

export default BackupExportPage;
