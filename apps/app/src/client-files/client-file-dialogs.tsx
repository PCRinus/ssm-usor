import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  getListClientFilesQueryKey,
  useDeleteClientFile,
  useUpdateClientFile,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';

import { archivedMessage, type ClientFile } from './client-file-format';

const clientFileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Introdu numele fișierului.')
    .max(200, 'Numele are cel mult 200 de caractere.'),
  note: z.string().trim().max(2000, 'Nota are cel mult 2000 de caractere.'),
});

type ClientFileFormValues = z.infer<typeof clientFileFormSchema>;

function changeFailure(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  if (cause.status === 404) return 'Fișierul nu mai există la acest client.';
  if (cause.status === 409) return archivedMessage;
  if (cause.status === 403) {
    return 'Doar cine a încărcat fișierul sau un administrator îl poate modifica.';
  }
  return fallback;
}

export function RenameClientFileDialog({
  clientId,
  file,
  onClose,
}: {
  clientId: string;
  file: ClientFile | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      {file && <RenameForm key={file.id} clientId={clientId} file={file} onClose={onClose} />}
    </Dialog>
  );
}

function RenameForm({
  clientId,
  file,
  onClose,
}: {
  clientId: string;
  file: ClientFile;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateClientFile({ request: apiRequest });
  const form = useForm<ClientFileFormValues>({
    resolver: zodResolver(clientFileFormSchema),
    defaultValues: { name: file.name, note: file.note ?? '' },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        clientId,
        fileId: file.id,
        data: { name: values.name, note: values.note || null },
      });
      await queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(clientId) });
      toast.success('Fișierul a fost salvat.');
      onClose();
    } catch (cause) {
      form.setError('root.server', {
        message: changeFailure(
          cause,
          'Nu am putut salva fișierul. Verifică conexiunea și încearcă din nou.'
        ),
      });
    }
  });

  return (
    <DialogContent data-testid="client-file-dialog" className="sm:max-w-lg">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Redenumește fișierul</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            Încărcat ca „{file.originalFileName}”. Poți adăuga și o notă despre el.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field id="client-file-name" label="Nume" mark="required" error={errors.name}>
            <Input
              id="client-file-name"
              data-testid="client-file-name"
              autoComplete="off"
              maxLength={200}
              disabled={busy}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'client-file-name-error' : undefined}
              {...form.register('name')}
            />
          </Field>
          <Field
            id="client-file-note"
            label="Notă"
            mark="optional"
            hint="De exemplu ce conține fișierul sau până când este valabil."
            error={errors.note}
          >
            <Textarea
              id="client-file-note"
              data-testid="client-file-note"
              rows={4}
              maxLength={2000}
              disabled={busy}
              aria-invalid={Boolean(errors.note)}
              aria-describedby={errors.note ? 'client-file-note-error' : 'client-file-note-hint'}
              {...form.register('note')}
            />
          </Field>
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="client-file-dialog-error">
              {errors.root.server.message}
            </Notice>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="client-file-save" disabled={busy}>
            {busy ? 'Se salvează…' : 'Salvează'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function DeleteClientFileDialog({
  clientId,
  file,
  onClose,
  onError,
}: {
  clientId: string;
  file: ClientFile | null;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const remove = useDeleteClientFile({ request: apiRequest });

  async function deleteFile(target: ClientFile) {
    try {
      await remove.mutateAsync({ clientId, fileId: target.id });
      toast.success(`„${target.name}” a fost șters.`);
    } catch (cause) {
      onError(
        changeFailure(
          cause,
          'Nu am putut șterge fișierul. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
    onClose();
    // Also after a failure: a 404 means the list on screen is out of date.
    await queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(clientId) });
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      {file && (
        <DialogContent data-testid="client-file-delete-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ștergi fișierul?</DialogTitle>
            <DialogDescription className="wrap-anywhere">
              <span className="font-medium text-foreground">{file.name}</span> se șterge definitiv
              și nu mai poate fi recuperat.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={remove.isPending} onClick={onClose}>
              Renunță
            </Button>
            <Button
              variant="destructive"
              data-testid="client-file-delete-confirm"
              disabled={remove.isPending}
              onClick={() => void deleteFile(file)}
            >
              {remove.isPending ? 'Se șterge…' : 'Șterge definitiv'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
