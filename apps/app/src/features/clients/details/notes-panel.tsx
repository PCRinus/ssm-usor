import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getGetClientOwnerNotesQueryKey,
  useGetClientOwnerNotes,
  useSaveClientOwnerNotes,
} from '@/api/generated/api';
import { replayMask } from '@/app/observability/replay-masking';
import { Notice } from '@/components/notice';
import { FormActions, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';

import { SheetAction } from './sheet-action';

const maxLength = 5000;

// Rendered for owners only: the API refuses anyone else.
export function NotesPanel({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryKey = [...getGetClientOwnerNotesQueryKey(clientId), userId];
  const notes = useGetClientOwnerNotes(clientId, { request: apiRequest, query: { queryKey } });
  const { editing, editRef, open, close } = useInPlaceEdit();
  const body = notes.data?.notes.body ?? '';

  return (
    <SectionCard
      data-testid="owner-notes-card"
      className="gap-4"
      title="Notițe"
      help="detalii.notite"
      action={
        notes.isSuccess &&
        !readOnly &&
        !editing && (
          <SheetAction
            ref={editRef}
            adding={body === ''}
            data-testid="owner-notes-edit"
            onClick={open}
          />
        )
      }
    >
      {notes.isPending ? (
        <Skeleton className="h-10 w-full max-w-[70ch]" />
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
      ) : editing && !readOnly ? (
        <NotesForm clientId={clientId} queryKey={queryKey} saved={body} onClose={close} />
      ) : body ? (
        <p
          data-testid="owner-notes-text"
          className="max-w-[70ch] text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap"
          {...replayMask}
        >
          {body}
        </p>
      ) : (
        <p data-testid="owner-notes-empty" className="text-sm text-muted-foreground">
          {readOnly ? 'Nicio notiță.' : 'Nicio notiță încă.'}
        </p>
      )}
    </SectionCard>
  );
}

function NotesForm({
  clientId,
  queryKey,
  saved,
  onClose,
}: {
  clientId: string;
  queryKey: readonly unknown[];
  saved: string;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const save = useSaveClientOwnerNotes({ request: apiRequest });
  const [body, setBody] = useState(saved);
  const [failed, setFailed] = useState(false);

  async function submit() {
    setFailed(false);
    try {
      const response = await save.mutateAsync({ clientId, data: { body } });
      queryClient.setQueryData(queryKey, response);
      toast.success('Notițele au fost salvate.');
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <form
      data-testid="owner-notes-form"
      className="grid gap-4"
      aria-busy={save.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Textarea
        data-testid="owner-notes-body"
        aria-label="Notițe"
        className="min-h-32"
        maxLength={maxLength}
        value={body}
        autoFocus
        disabled={save.isPending}
        placeholder="De exemplu: sunat pe 12.09, vrea ofertă pentru 15 lucrători."
        onChange={(event) => setBody(event.target.value)}
      />
      {failed && (
        <Notice variant="destructive" data-testid="owner-notes-error">
          Nu am putut salva notițele. Verifică conexiunea și încearcă din nou.
        </Notice>
      )}
      <FormActions>
        <Button
          type="submit"
          data-testid="owner-notes-save"
          disabled={save.isPending || body === saved}
        >
          {save.isPending ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="owner-notes-cancel"
          disabled={save.isPending}
          onClick={onClose}
        >
          Renunță
        </Button>
      </FormActions>
    </form>
  );
}
