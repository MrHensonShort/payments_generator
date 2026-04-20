/**
 * MultiCategorySelect – checkbox-based multi-select for transaction categories.
 *
 * Groups categories by CategoryGroup and renders them in a scrollable panel.
 * At least one category must remain selected (enforced by disabling the last
 * checked item).
 *
 * data-testid: "multi-category-select"
 */
import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { Button } from '@/ui/components/button';
import { Badge } from '@/ui/components/badge';
import {
  ALL_CATEGORIES,
  CATEGORY_GROUP_LABELS,
  CATEGORY_META,
  getCategoryLabel,
  type Category,
  type CategoryGroup,
} from '@/domain/category/categoryEnum';

interface MultiCategorySelectProps {
  value: Category[];
  onChange: (categories: Category[]) => void;
  /** Require at least one selection (default: true) */
  requireOne?: boolean;
  'data-testid'?: string;
}

const GROUPS: CategoryGroup[] = Object.keys(CATEGORY_GROUP_LABELS) as CategoryGroup[];

export function MultiCategorySelect({
  value,
  onChange,
  requireOne = true,
  'data-testid': testId = 'multi-category-select',
}: MultiCategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<CategoryGroup>>(new Set());

  const toggle = (cat: Category) => {
    if (value.includes(cat)) {
      if (requireOne && value.length === 1) return; // keep at least one
      onChange(value.filter((c) => c !== cat));
    } else {
      onChange([...value, cat]);
    }
  };

  const toggleGroup = (group: CategoryGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const labelText =
    value.length === 0
      ? 'Kategorie wählen…'
      : value.length === 1
        ? getCategoryLabel(value[0])
        : `${value.length} Kategorien`;

  return (
    <div className="relative" data-testid={testId}>
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full justify-between text-sm font-normal"
        onClick={() => setOpen((o) => !o)}
        data-testid={`${testId}-trigger`}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Tag className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate">{labelText}</span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        )}
      </Button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
          data-testid={`${testId}-panel`}
        >
          {/* Selected badges strip */}
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b p-2">
              {value.map((cat) => (
                <Badge
                  key={cat}
                  variant="secondary"
                  className="cursor-pointer text-xs"
                  onClick={() => toggle(cat)}
                  data-testid={`${testId}-badge-${cat}`}
                >
                  {getCategoryLabel(cat)} ✕
                </Badge>
              ))}
            </div>
          )}

          {/* Scrollable group list */}
          <div className="max-h-72 overflow-y-auto p-1">
            {GROUPS.map((group) => {
              const groupCats = ALL_CATEGORIES.filter((c) => CATEGORY_META[c].group === group);
              const isExpanded = expandedGroups.has(group);
              const selectedCount = groupCats.filter((c) => value.includes(c)).length;

              return (
                <div key={group}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => toggleGroup(group)}
                  >
                    <span>{CATEGORY_GROUP_LABELS[group]}</span>
                    <span className="flex items-center gap-1">
                      {selectedCount > 0 && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          {selectedCount}
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </span>
                  </button>

                  {isExpanded &&
                    groupCats.map((cat) => {
                      const checked = value.includes(cat);
                      const disabled = requireOne && checked && value.length === 1;
                      return (
                        <button
                          key={cat}
                          type="button"
                          disabled={disabled}
                          className="flex w-full items-center gap-2 rounded px-4 py-1 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                          onClick={() => toggle(cat)}
                          data-testid={`${testId}-item-${cat}`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary' : 'border-input'}`}
                          >
                            {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                          </span>
                          <span className="truncate">{getCategoryLabel(cat)}</span>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>

          <div className="border-t p-2 text-right">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setOpen(false)}
            >
              Schließen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
