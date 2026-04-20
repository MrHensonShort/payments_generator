/**
 * AmountConfigField – reusable AmountConfig form section.
 *
 * Renders controls for fix / range / basis amount modes and an optional
 * TrendConfig section.  Used by all three generator forms.
 *
 * data-testid prefix: "amount-" (e.g. "amount-mode-select", "amount-fix-value")
 */
import { Label } from '@/ui/components/label';
import { Input } from '@/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import type { AmountConfig } from '@/domain/AmountCalculator';

export interface AmountConfigFieldProps {
  value: AmountConfig;
  onChange: (config: AmountConfig) => void;
  /** data-testid prefix (default: "amount") */
  testIdPrefix?: string;
}

export function AmountConfigField({
  value,
  onChange,
  testIdPrefix = 'amount',
}: AmountConfigFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label
          htmlFor={`${testIdPrefix}-mode`}
          className="text-xs text-muted-foreground mb-1 block"
        >
          Betragstyp
        </Label>
        <Select
          value={value.mode}
          onValueChange={(mode) => {
            if (mode === 'fix') onChange({ mode: 'fix', amount: 0 });
            else if (mode === 'range') onChange({ mode: 'range', min: 0, max: 100 });
            else onChange({ mode: 'basis', base: 0, variance: 10 });
          }}
        >
          <SelectTrigger
            id={`${testIdPrefix}-mode`}
            data-testid={`${testIdPrefix}-mode-select`}
            className="h-8 text-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fix">Fix (fester Betrag)</SelectItem>
            <SelectItem value="range">Bereich (min–max)</SelectItem>
            <SelectItem value="basis">Basis ± Varianz</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.mode === 'fix' && (
        <div>
          <Label
            htmlFor={`${testIdPrefix}-fix`}
            className="text-xs text-muted-foreground mb-1 block"
          >
            Betrag (EUR)
          </Label>
          <Input
            id={`${testIdPrefix}-fix`}
            type="number"
            step="0.01"
            value={value.amount}
            onChange={(e) => onChange({ mode: 'fix', amount: parseFloat(e.target.value) || 0 })}
            data-testid={`${testIdPrefix}-fix-value`}
            className="h-8 text-sm"
          />
        </div>
      )}

      {value.mode === 'range' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label
              htmlFor={`${testIdPrefix}-min`}
              className="text-xs text-muted-foreground mb-1 block"
            >
              Min (EUR)
            </Label>
            <Input
              id={`${testIdPrefix}-min`}
              type="number"
              step="0.01"
              value={value.min}
              onChange={(e) =>
                onChange({ mode: 'range', min: parseFloat(e.target.value) || 0, max: value.max })
              }
              data-testid={`${testIdPrefix}-range-min`}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label
              htmlFor={`${testIdPrefix}-max`}
              className="text-xs text-muted-foreground mb-1 block"
            >
              Max (EUR)
            </Label>
            <Input
              id={`${testIdPrefix}-max`}
              type="number"
              step="0.01"
              value={value.max}
              onChange={(e) =>
                onChange({ mode: 'range', min: value.min, max: parseFloat(e.target.value) || 0 })
              }
              data-testid={`${testIdPrefix}-range-max`}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      {value.mode === 'basis' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label
              htmlFor={`${testIdPrefix}-base`}
              className="text-xs text-muted-foreground mb-1 block"
            >
              Basis (EUR)
            </Label>
            <Input
              id={`${testIdPrefix}-base`}
              type="number"
              step="0.01"
              value={value.base}
              onChange={(e) =>
                onChange({
                  mode: 'basis',
                  base: parseFloat(e.target.value) || 0,
                  variance: value.variance,
                })
              }
              data-testid={`${testIdPrefix}-basis-base`}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label
              htmlFor={`${testIdPrefix}-variance`}
              className="text-xs text-muted-foreground mb-1 block"
            >
              Varianz (%)
            </Label>
            <Input
              id={`${testIdPrefix}-variance`}
              type="number"
              min="0"
              max="100"
              step="1"
              value={value.variance}
              onChange={(e) =>
                onChange({
                  mode: 'basis',
                  base: value.base,
                  variance: parseFloat(e.target.value) || 0,
                })
              }
              data-testid={`${testIdPrefix}-basis-variance`}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
