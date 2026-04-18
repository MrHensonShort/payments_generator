import { X } from 'lucide-react';
import { Progress } from '@/ui/components/progress';
import { Button } from '@/ui/components/button';
import { cn } from '@/lib/utils';

/**
 * ProgressBar – Fortschrittsanzeige mit Worker-Progress-Events + Abbrechen-Button
 * (CLA-49 / P4a-05)
 *
 * Integrates with the generationWorker progress events:
 *   { type: 'progress', percent: number, generated: number, total: number }
 *
 * Usage:
 *   <ProgressBar
 *     visible={isGenerating}
 *     percent={progress}
 *     generated={generatedCount}
 *     total={estimatedTotal}
 *     onCancel={handleCancel}
 *   />
 */
export interface ProgressBarProps {
  /** Whether the progress bar is shown */
  visible: boolean;
  /** 0–100 */
  percent: number;
  /** Number of transactions generated so far */
  generated?: number;
  /** Estimated total transactions */
  total?: number;
  /** Called when the user clicks Abbrechen */
  onCancel?: () => void;
  className?: string;
}

export function ProgressBar({
  visible,
  percent,
  generated,
  total,
  onCancel,
  className,
}: ProgressBarProps) {
  if (!visible) return null;

  const clamped = Math.max(0, Math.min(100, percent));
  const isDone = clamped >= 100;

  return (
    <div
      className={cn('rounded-lg border border-border bg-card px-4 py-3 space-y-2', className)}
      data-testid="progress-bar"
      role="status"
      aria-label={`Generierung: ${clamped.toFixed(0)} %`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              {isDone ? 'Abgeschlossen' : 'Generierung läuft…'}
            </span>
            <span className="font-mono-nums text-muted-foreground">
              {clamped.toFixed(0)}&nbsp;%
            </span>
          </div>
          <Progress value={clamped} data-testid="progress-bar-indicator" />
          {generated !== undefined && total !== undefined && (
            <p
              className="text-xs text-muted-foreground font-mono-nums"
              data-testid="progress-bar-count"
            >
              {generated.toLocaleString('de-DE')} / {total.toLocaleString('de-DE')} Transaktionen
            </p>
          )}
        </div>

        {!isDone && onCancel && (
          <Button
            variant="outline"
            size="icon"
            onClick={onCancel}
            title="Generierung abbrechen"
            data-testid="progress-bar-cancel"
            className="shrink-0 h-8 w-8 border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Abbrechen</span>
          </Button>
        )}
      </div>
    </div>
  );
}
