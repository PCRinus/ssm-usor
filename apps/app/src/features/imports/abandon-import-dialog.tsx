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
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { abandonImport, getGetImportQueryKey, getListImportsQueryKey } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { importErrorMessage } from './import-format';

export function AbandonImportDialog({
  importId,
  running,
  employees = false,
  onClose,
  onAbandoned,
}: {
  importId: string | null;
  running: boolean;
  employees?: boolean;
  onClose: () => void;
  onAbandoned: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abandon() {
    if (!importId) return;
    setSending(true);
    setError(null);
    try {
      await abandonImport(importId, apiRequest);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetImportQueryKey(importId) }),
        // The sheets an employee import took from the documentation are offered again.
        ...(employees
          ? [
              queryClient.invalidateQueries({
                predicate: ({ queryKey }) => String(queryKey[0]).endsWith('/found-sheets'),
              }),
            ]
          : []),
      ]);
      toast.success(running ? 'Importul a fost oprit.' : 'Ai renunțat la import.');
      onClose();
      onAbandoned();
    } catch (cause) {
      setError(importErrorMessage(cause, 'Importul nu a putut fi oprit. Încearcă din nou.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={importId !== null} onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent data-testid="import-abandon-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{running ? 'Oprești importul?' : 'Renunți la import?'}</DialogTitle>
          <DialogDescription>
            {employees
              ? 'Nu se creează și nu se modifică niciun angajat. Fotografiile încărcate se șterg după 14 zile.'
              : 'Nu se creează și nu se modifică niciun client. Fișierele încărcate se șterg după 14 zile.'}
          </DialogDescription>
        </DialogHeader>
        {error && <Notice variant="destructive">{error}</Notice>}
        <DialogFooter>
          <Button variant="outline" disabled={sending} onClick={onClose}>
            Înapoi
          </Button>
          <Button
            variant="destructive"
            data-testid="import-abandon-confirm"
            disabled={sending}
            onClick={() => void abandon()}
          >
            {running ? 'Oprește importul' : 'Renunță la import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
