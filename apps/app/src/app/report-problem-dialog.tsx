import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { toast } from '@ssm-usor/ui/lib/toast';

const supportEmail = 'contact@ssmusor.ro';
const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent('Problemă SSM Ușor')}`;

// Not a bare mailto redirect: on a device without a mail app it does nothing at all.
export function ReportProblemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(supportEmail);
      toast.success('Adresa a fost copiată.');
    } catch {
      toast.error('Nu am putut copia adresa. Selecteaz-o și copiaz-o manual.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="report-problem-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raportează o problemă</DialogTitle>
          <DialogDescription>
            Chatul de suport nu s-a putut deschide în acest browser. Scrie-ne pe e-mail și îți
            răspundem cât mai curând.
          </DialogDescription>
        </DialogHeader>
        <p
          data-testid="report-problem-email"
          className="rounded-md border bg-muted px-3 py-2 text-center font-medium select-all"
        >
          {supportEmail}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void copyAddress()}>
            Copiază adresa
          </Button>
          <Button asChild>
            <a href={mailto}>Deschide aplicația de e-mail</a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
