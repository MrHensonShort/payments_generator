import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/ui/components/dialog';
import { Button } from '@/ui/components/button';

/**
 * ConfirmModal – Bestätigungsdialog für destruktive Aktionen (UI-06 / CLA-48).
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmModal
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Alle Transaktionen löschen?"
 *     description="Diese Aktion kann nicht rückgängig gemacht werden."
 *     onConfirm={() => { deleteAll(); setOpen(false); }}
 *   />
 */
export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => void;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  variant = 'destructive',
  onConfirm,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="confirm-modal">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            {variant === 'destructive' && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            )}
            <DialogTitle data-testid="confirm-modal-title">{title}</DialogTitle>
          </div>
          {description && (
            <DialogDescription data-testid="confirm-modal-description">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="confirm-modal-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={() => {
              onConfirm();
            }}
            data-testid="confirm-modal-confirm"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
