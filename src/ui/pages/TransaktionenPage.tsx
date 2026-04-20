/**
 * TransaktionenPage – Transactions list with filter, KPI header, edit modal.
 *
 * Implements:
 *   CLA-57 (P4b-05): TanStack Table v8 + TanStack Virtual v3 (>5 000 rows)
 *   CLA-58 (P4b-06): Filter bar – free text, type, category, date range
 *   CLA-59 (P4b-07): KPI header – income sum, expense sum, balance
 *   CLA-60 (P4b-08): Transaction edit modal (inline edit + ConfirmModal delete)
 */
import { useState, useMemo, useRef, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Landmark,
  Search,
  X,
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/ui/components/dialog';
import { ConfirmModal } from '@/ui/components/confirm-modal';
import { Badge } from '@/ui/components/badge';
import { useTransactions } from '@/ui/hooks/useTransactions';
import { getCategoryLabel, type Category } from '@/domain/category/categoryEnum';
import type { TransactionEntry } from '@/infrastructure/database';

// ── KPI Header (CLA-59) ───────────────────────────────────────────────────────

interface KpiHeaderProps {
  transactions: TransactionEntry[];
}

function KpiHeader({ transactions }: KpiHeaderProps) {
  const income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = transactions
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = income - expense;

  const fmt = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <div className="grid grid-cols-3 gap-4 mb-4" data-testid="kpi-header">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
          <TrendingUp className="h-4 w-4 text-green-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Einnahmen</p>
          <p
            className="text-base font-semibold text-green-500 tabular-nums"
            data-testid="kpi-income"
          >
            {fmt(income)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
          <TrendingDown className="h-4 w-4 text-red-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ausgaben</p>
          <p
            className="text-base font-semibold text-red-500 tabular-nums"
            data-testid="kpi-expense"
          >
            {fmt(expense)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${balance >= 0 ? 'bg-blue-500/10' : 'bg-orange-500/10'}`}
        >
          <Landmark className={`h-4 w-4 ${balance >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Saldo</p>
          <p
            className={`text-base font-semibold tabular-nums ${balance >= 0 ? 'text-blue-500' : 'text-orange-500'}`}
            data-testid="kpi-balance"
          >
            {fmt(balance)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Filter Bar (CLA-58) ───────────────────────────────────────────────────────

interface FilterBarProps {
  globalFilter: string;
  setGlobalFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  onClear: () => void;
}

function FilterBar({
  globalFilter,
  setGlobalFilter,
  typeFilter,
  setTypeFilter,
  sourceFilter,
  setSourceFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onClear,
}: FilterBarProps) {
  const hasFilters =
    globalFilter || typeFilter !== 'all' || sourceFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2" data-testid="filter-bar">
      {/* Free-text search */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Suchen…"
          className="h-8 pl-8 text-sm"
          data-testid="filter-bar-text"
        />
      </div>

      {/* Source filter (recurring/episode/scatter/manual) */}
      <div className="w-44">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-8 text-sm" data-testid="filter-bar-type">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="recurring">Dauerauftrag</SelectItem>
            <SelectItem value="episode">Episodisch</SelectItem>
            <SelectItem value="scatter">Streubuchung</SelectItem>
            <SelectItem value="manual">Manuell</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Type filter (income/expense/transfer) */}
      <div className="w-40">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-sm" data-testid="filter-type">
            <SelectValue placeholder="Buchungsart" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="income">Einnahmen</SelectItem>
            <SelectItem value="expense">Ausgaben</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-1">
        <Label className="sr-only">Von</Label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 w-36 text-sm"
          data-testid="filter-date-from"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-8 w-36 text-sm"
          data-testid="filter-date-to"
        />
      </div>

      {/* Clear button */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 gap-1 text-xs"
          data-testid="filter-clear"
        >
          <X className="h-3.5 w-3.5" />
          Zurücksetzen
        </Button>
      )}
    </div>
  );
}

// ── Edit Modal (CLA-60) ───────────────────────────────────────────────────────

interface EditModalProps {
  transaction: TransactionEntry | null;
  onClose: () => void;
  onSave: (id: string, changes: Partial<Omit<TransactionEntry, 'id'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function EditModal({ transaction, onClose, onSave, onDelete }: EditModalProps) {
  const [form, setForm] = useState<Partial<TransactionEntry>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync form when transaction changes
  const prevId = useRef<string | null>(null);
  if (transaction && transaction.id !== prevId.current) {
    prevId.current = transaction.id;
    setForm({ ...transaction });
  }

  if (!transaction) return null;

  const patch = (partial: Partial<TransactionEntry>) => setForm((f) => ({ ...f, ...partial }));

  const handleSave = async () => {
    const changes = Object.fromEntries(Object.entries(form).filter(([k]) => k !== 'id')) as Partial<
      Omit<TransactionEntry, 'id'>
    >;
    await onSave(transaction.id, changes);
    onClose();
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent data-testid="transaction-edit-modal">
          <DialogHeader>
            <DialogTitle>Transaktion bearbeiten</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-date" className="text-xs text-muted-foreground mb-1 block">
                  Datum
                </Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={form.date ?? ''}
                  onChange={(e) => patch({ date: e.target.value })}
                  data-testid="edit-date"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="edit-time" className="text-xs text-muted-foreground mb-1 block">
                  Uhrzeit
                </Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={form.time ?? ''}
                  onChange={(e) => patch({ time: e.target.value })}
                  data-testid="edit-time"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-amount" className="text-xs text-muted-foreground mb-1 block">
                Betrag (EUR)
              </Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                value={form.amount ?? 0}
                onChange={(e) => patch({ amount: parseFloat(e.target.value) || 0 })}
                data-testid="transaction-edit-modal-amount"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label
                htmlFor="edit-counterparty"
                className="text-xs text-muted-foreground mb-1 block"
              >
                Gegenkonto
              </Label>
              <Input
                id="edit-counterparty"
                value={form.counterparty ?? ''}
                onChange={(e) => patch({ counterparty: e.target.value })}
                data-testid="edit-counterparty"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label htmlFor="edit-purpose" className="text-xs text-muted-foreground mb-1 block">
                Verwendungszweck
              </Label>
              <Input
                id="edit-purpose"
                value={form.purpose ?? ''}
                onChange={(e) => patch({ purpose: e.target.value })}
                data-testid="transaction-edit-modal-purpose"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <Label htmlFor="edit-category" className="text-xs text-muted-foreground mb-1 block">
                Kategorie
              </Label>
              <Input
                id="edit-category"
                value={form.category ?? ''}
                onChange={(e) => patch({ category: e.target.value })}
                data-testid="edit-category"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-row justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              data-testid="edit-delete-btn"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Löschen
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                data-testid="transaction-edit-modal-cancel-btn"
              >
                Abbrechen
              </Button>
              <Button size="sm" onClick={handleSave} data-testid="transaction-edit-modal-save-btn">
                Speichern
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Transaktion löschen?"
        description="Diese Transaktion wird dauerhaft gelöscht."
        confirmLabel="Löschen"
        onConfirm={async () => {
          await onDelete(transaction.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </>
  );
}

// ── Source badge helper ───────────────────────────────────────────────────────

const SOURCE_LABEL: Record<TransactionEntry['source'], string> = {
  recurring: 'Dauerauftrag',
  episode: 'Episodisch',
  scatter: 'Streuung',
  manual: 'Manuell',
};
const SOURCE_VARIANT: Record<
  TransactionEntry['source'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  recurring: 'default',
  episode: 'secondary',
  scatter: 'outline',
  manual: 'destructive',
};

// ── Main component ────────────────────────────────────────────────────────────

function TransaktionenPage() {
  const { transactions, loading, updateTransaction, deleteTransaction, clearAll } =
    useTransactions();

  // Filter state
  const [globalFilter, setGlobalFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sort & editing state
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [editTarget, setEditTarget] = useState<TransactionEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransactionEntry | null>(null);

  // Apply client-side filters before passing to TanStack Table
  const filteredData = useMemo(() => {
    let data = transactions;

    if (sourceFilter !== 'all') {
      data = data.filter((t) => t.source === sourceFilter);
    }
    if (typeFilter === 'income') {
      data = data.filter((t) => t.amount > 0);
    } else if (typeFilter === 'expense') {
      data = data.filter((t) => t.amount < 0);
    }
    if (dateFrom) {
      data = data.filter((t) => t.date >= dateFrom);
    }
    if (dateTo) {
      data = data.filter((t) => t.date <= dateTo);
    }
    if (globalFilter.trim()) {
      const q = globalFilter.toLowerCase();
      data = data.filter(
        (t) =>
          t.counterparty.toLowerCase().includes(q) ||
          t.purpose.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.date.includes(q),
      );
    }

    return data;
  }, [transactions, sourceFilter, typeFilter, dateFrom, dateTo, globalFilter]);

  // Column definitions
  const columns = useMemo<ColumnDef<TransactionEntry>[]>(
    () => [
      {
        accessorKey: 'date',
        header: 'Datum',
        size: 100,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'time',
        header: 'Zeit',
        size: 70,
        cell: ({ getValue }) => <span className="tabular-nums">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'amount',
        header: 'Betrag',
        size: 110,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span
              className={`tabular-nums font-medium ${v >= 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </span>
          );
        },
      },
      {
        accessorKey: 'counterparty',
        header: 'Gegenkonto',
        size: 180,
        cell: ({ getValue }) => (
          <span className="truncate block max-w-[170px]">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'purpose',
        header: 'Verwendungszweck',
        size: 200,
        cell: ({ getValue }) => (
          <span className="truncate block max-w-[190px]">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Kategorie',
        size: 160,
        cell: ({ getValue }) => {
          const cat = getValue<string>() as Category;
          return <span className="truncate block max-w-[150px]">{getCategoryLabel(cat)}</span>;
        },
      },
      {
        accessorKey: 'source',
        header: 'Typ',
        size: 110,
        cell: ({ getValue }) => {
          const src = getValue<TransactionEntry['source']>();
          return (
            <Badge variant={SOURCE_VARIANT[src]} className="text-xs">
              {SOURCE_LABEL[src]}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        size: 80,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                setEditTarget(row.original);
              }}
              data-testid="transaction-edit-btn"
              title="Bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(row.original);
              }}
              data-testid="transaction-delete-btn"
              title="Löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const clearFilters = useCallback(() => {
    setGlobalFilter('');
    setTypeFilter('all');
    setSourceFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  // KPI data is computed from ALL transactions (not filtered)
  // so users see global balance while filtering for details.
  // Showing filtered KPIs is also useful — use filteredData here.
  const kpiData = filteredData;

  return (
    <div className="flex h-full flex-col p-6" data-testid="transaktionen-page">
      {/* ── KPI Header (CLA-59) ─────────────────────────────────────────── */}
      <KpiHeader transactions={kpiData} />

      {/* ── Filter Bar (CLA-58) ─────────────────────────────────────────── */}
      <FilterBar
        globalFilter={globalFilter}
        setGlobalFilter={setGlobalFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        onClear={clearFilters}
      />

      {/* ── Table header row with row count + clear-all ──────────────────── */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted-foreground" data-testid="tx-count">
          {filteredData.length.toLocaleString('de-DE')} Transaktionen
          {filteredData.length !== transactions.length &&
            ` (von ${transactions.length.toLocaleString('de-DE')})`}
        </p>
        {transactions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmClear(true)}
            className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
            data-testid="tx-clear-all"
          >
            <Trash2 className="h-3 w-3" />
            Alle löschen
          </Button>
        )}
      </div>

      {/* ── Table (CLA-57 – TanStack Table v8 + Virtual v3) ─────────────── */}
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Lade…</p>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-hidden rounded-lg border"
          data-testid="transaction-table"
        >
          {transactions.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-24 text-muted-foreground"
              data-testid="transaction-table-empty"
            >
              <p className="text-sm">
                Noch keine Transaktionen. Generiere Daten in den Generator-Tabs.
              </p>
            </div>
          ) : (
            <>
              {/* Fixed table header */}
              <div className="border-b bg-card" data-testid="tx-table-header">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((header) => (
                          <th
                            key={header.id}
                            style={{ width: header.getSize() }}
                            className="select-none px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                          >
                            {header.isPlaceholder ? null : (
                              <button
                                className="flex items-center gap-1 hover:text-foreground"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {header.column.getCanSort() &&
                                  ({
                                    asc: <ArrowUp className="h-3 w-3" />,
                                    desc: <ArrowDown className="h-3 w-3" />,
                                  }[header.column.getIsSorted() as string] ?? (
                                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                                  ))}
                              </button>
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                </table>
              </div>

              {/* Virtually scrolled body */}
              <div
                ref={parentRef}
                className="overflow-y-auto"
                style={{ height: 'calc(100% - 37px)' }}
              >
                <div style={{ height: `${totalSize}px`, position: 'relative' }}>
                  <table
                    className="w-full table-fixed text-sm"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                    }}
                  >
                    <tbody>
                      {virtualItems.map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        return (
                          <tr
                            key={row.id}
                            style={{
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            className="absolute w-full border-b last:border-b-0 hover:bg-accent/50"
                            data-testid="transaction-table-row"
                            onClick={() => setEditTarget(row.original)}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <td
                                key={cell.id}
                                style={{ width: cell.column.getSize() }}
                                className="px-3 py-1.5 text-sm"
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Edit Modal (CLA-60) ──────────────────────────────────────────── */}
      <EditModal
        transaction={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={updateTransaction}
        onDelete={deleteTransaction}
      />

      {/* ── Confirm delete row ───────────────────────────────────────────── */}
      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Transaktion löschen?"
        description="Diese Transaktion wird dauerhaft gelöscht."
        confirmLabel="Löschen"
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteTransaction(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />

      {/* ── Confirm clear all ────────────────────────────────────────────── */}
      <ConfirmModal
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Alle Transaktionen löschen?"
        description={`${transactions.length.toLocaleString('de-DE')} Transaktionen werden dauerhaft gelöscht.`}
        confirmLabel="Alle löschen"
        onConfirm={async () => {
          await clearAll();
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

export default TransaktionenPage;
