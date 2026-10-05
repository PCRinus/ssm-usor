import { Button } from '@ssm-usor/ui/components/button';
import { LibraryBig } from 'lucide-react';

export function LibraryNudge({ onSave, onDismiss }: { onSave: () => void; onDismiss: () => void }) {
  return (
    <div
      data-testid="risk-library-nudge"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-muted/55 px-6 py-4"
    >
      <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3 text-sm">
        <LibraryBig aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="grid gap-0.5">
          <p className="font-medium">Factorii nu sunt încă în biblioteca de riscuri.</p>
          <p className="text-muted-foreground">
            Salvează-i ca profil și îi aplici la alți clienți fără să-i scrii din nou.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-7 sm:pl-0">
        <Button variant="tonal" size="sm" data-testid="risk-library-nudge-save" onClick={onSave}>
          Salvează în bibliotecă…
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="risk-library-nudge-dismiss"
          onClick={onDismiss}
        >
          Nu acum
        </Button>
      </div>
    </div>
  );
}
