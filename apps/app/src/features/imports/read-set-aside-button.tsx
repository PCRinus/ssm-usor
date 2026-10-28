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

import {
  getGetImportQueryKey,
  getListImportsQueryKey,
  type ImportDetail,
  type ImportDetailFilesItem,
  readImportFile,
} from '@/api/generated/api';

import { importErrorMessage } from './import-format';

const hasChanges = (detail: ImportDetail) =>
  Boolean(
    detail.changes &&
    (Object.keys(detail.changes.fields ?? {}).length > 0 ||
      Object.keys(detail.changes.items ?? {}).length > 0)
  );

export function ReadSetAsideButton({
  detail,
  file,
}: {
  detail: ImportDetail;
  file: ImportDetailFilesItem;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  async function read() {
    setSending(true);
    try {
      await readImportFile(detail.id, file.id, apiRequest);
      setConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetImportQueryKey(detail.id) }),
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
      ]);
    } catch (cause) {
      toast.error(importErrorMessage(cause, 'Fișierul nu a putut fi trimis la citit.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="xs"
        data-testid="import-read-set-aside"
        disabled={sending}
        onClick={() => (hasChanges(detail) ? setConfirming(true) : void read())}
      >
        Citește-l totuși
      </Button>
      <Dialog open={confirming} onOpenChange={(open) => !open && !sending && setConfirming(false)}>
        <DialogContent className="sm:max-w-md" data-testid="import-read-set-aside-dialog">
          <DialogHeader>
            <DialogTitle>Citim din nou documentația?</DialogTitle>
            <DialogDescription>
              Citim „{file.fileName}” împreună cu celelalte documente și facem o propunere nouă. Ce
              ai schimbat în propunerea de acum se pierde.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={sending} onClick={() => setConfirming(false)}>
              Înapoi
            </Button>
            <Button disabled={sending} onClick={() => void read()}>
              Citește din nou
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
