import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getGetClientOwnerNotesQueryKey,
  useGetClientOwnerNotes,
  useSaveClientOwnerNotes,
} from '../api/generated/api';
import { Notice } from '../components/notice';

const maxLength = 5000;

// Rendered for owners only: the API refuses anyone else. `readOnly` is an archived company.
export function OwnerNotesCard({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const queryKey = [...getGetClientOwnerNotesQueryKey(clientId), userId];
  const notes = useGetClientOwnerNotes(clientId, { request: apiRequest, query: { queryKey } });
  const save = useSaveClientOwnerNotes({ request: apiRequest });
  // Null until the person types: the field then shows what was saved, whenever that arrives.
  const [typed, setTyped] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const saved = notes.data?.notes.body ?? '';
  const body = typed ?? saved;
  const dirty = typed !== null && typed !== saved;

  async function submit() {
    setFailed(false);
    try {
      const response = await save.mutateAsync({ clientId, data: { body } });
      queryClient.setQueryData(queryKey, response);
      setTyped(null);
      toast.success('Notițele au fost salvate.');
    } catch {
      setFailed(true);
    }
  }

  return (
    <Card data-testid="owner-notes-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notițe</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Doar administratorii pot vedea aceste notițe. Păstrează aici discuțiile, prețurile și
          pașii următori.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {notes.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : notes.isError ? (
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={notes.isFetching}
                onClick={() => void notes.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca notițele.
          </Notice>
        ) : (
          <>
            <Textarea
              data-testid="owner-notes-body"
              aria-label="Notițe"
              className="min-h-32"
              maxLength={maxLength}
              value={body}
              readOnly={readOnly}
              disabled={save.isPending}
              placeholder={
                readOnly
                  ? 'Nicio notiță.'
                  : 'De exemplu: sunat pe 12.09, vrea ofertă pentru 15 angajați.'
              }
              onChange={(event) => setTyped(event.target.value)}
            />
            {failed && (
              <Notice variant="destructive" data-testid="owner-notes-error">
                Nu am putut salva notițele. Verifică conexiunea și încearcă din nou.
              </Notice>
            )}
            {!readOnly && (
              <div className="flex items-center gap-3">
                <Button
                  data-testid="owner-notes-save"
                  disabled={!dirty || save.isPending}
                  onClick={() => void submit()}
                >
                  {save.isPending ? 'Se salvează…' : 'Salvează notițele'}
                </Button>
                <span data-testid="owner-notes-state" className="text-xs text-muted-foreground">
                  {dirty ? 'Modificări nesalvate' : notes.data.notes.updatedAt ? 'Salvat' : ''}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
