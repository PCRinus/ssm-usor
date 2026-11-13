import {
  type AdminLegalChangeDetail,
  adminLegislationErrorReasons,
  type AdminTemplateVersion,
  type ApiErrorResponse,
  maxLegalChangeNoteLength,
  minLegalChangeNoteLength,
} from '@ssm-usor/contracts';
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
import { Label } from '@ssm-usor/ui/components/label';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import { ApiHttpError, isRefusedByApi } from '@/api/http';
import { ErrorNotice } from '@/components/error-notice';
import { formatDateTime } from '@/lib/format';

import { legislationKey, linkTemplateVersion, refreshLegislation, resolveNoImpact } from './api';
import { formatDay, versionKindLabels } from './format';

function refusalOf(error: Error) {
  if (isRefusedByApi(error)) return 'This session may not change the legislation. Sign in again.';
  const body = error instanceof ApiHttpError ? (error.body as ApiErrorResponse | undefined) : null;
  if (body?.reason === adminLegislationErrorReasons.changeNotOpen) {
    return 'The change was resolved in the meantime. Close this and look at it again.';
  }
  if (body?.reason === adminLegislationErrorReasons.versionCannotAnswer) {
    return 'This version can no longer answer the change: it may answer another one by now.';
  }
  if (body?.reason === adminLegislationErrorReasons.olderChangeOpen) {
    return 'An older change of this act is still open. Resolve it first: the page now lists it.';
  }
  if (body?.reason === adminLegislationErrorReasons.changeNotAssessed) {
    return 'The daily check has not assessed this change yet. Resolve it once it has.';
  }
  if (body?.error === 'validation_error') {
    return `The note needs ${minLegalChangeNoteLength} to ${maxLegalChangeNoteLength} characters.`;
  }
  return 'The change could not be saved. Check the connection and try again.';
}

function useResolve(
  change: AdminLegalChangeDetail,
  write: () => Promise<AdminLegalChangeDetail>,
  onDone: () => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (detail) => {
      queryClient.setQueryData([...legislationKey, 'change', change.id], detail);
      void refreshLegislation(queryClient);
      onDone();
    },
    onError: (error) => {
      const body =
        error instanceof ApiHttpError ? (error.body as ApiErrorResponse | undefined) : null;
      if (
        body?.reason === adminLegislationErrorReasons.olderChangeOpen ||
        body?.reason === adminLegislationErrorReasons.changeNotAssessed
      ) {
        void queryClient.invalidateQueries({ queryKey: [...legislationKey, 'change', change.id] });
      }
    },
  });
}

export function NoImpactDialog({
  change,
  open,
  onClose,
}: {
  change: AdminLegalChangeDetail;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="no-impact-dialog">
        {open && <NoImpactForm change={change} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function NoImpactForm({
  change,
  onClose,
}: {
  change: AdminLegalChangeDetail;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const saving = useResolve(
    change,
    () => resolveNoImpact(change.id, note.trim(), apiRequest),
    onClose
  );
  const short = note.trim().length < minLegalChangeNoteLength;
  const noteError = tried && short ? 'Write the note members will read.' : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!short) saving.mutate();
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Mark as no impact</DialogTitle>
        <DialogDescription>
          {change.act.name}, form of {formatDay(change.consolidatedOn)}. The change is resolved, and
          the act’s verified form moves to this one, so the next form is compared with it.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-4 space-y-2">
        <Label htmlFor="no-impact-note">Note for members, in Romanian</Label>
        <Textarea
          id="no-impact-note"
          data-testid="no-impact-note"
          value={note}
          rows={4}
          maxLength={maxLegalChangeNoteLength}
          placeholder="Modificarea adusă de Legea 207/2026 atinge art. 6; niciun text citat în documente nu s-a schimbat."
          aria-invalid={noteError ? true : undefined}
          aria-describedby="no-impact-note-help"
          onChange={(event) => setNote(event.target.value)}
        />
        <p id="no-impact-note-help" className="text-muted-foreground text-sm">
          Every member reads it on their Legislație page, under this change. Name what was amended
          and why no document needs to change.
        </p>
        {noteError && (
          <p data-testid="no-impact-note-error" className="text-destructive text-sm">
            {noteError}
          </p>
        )}
        {saving.error && (
          <ErrorNotice testId="no-impact-error">{refusalOf(saving.error)}</ErrorNotice>
        )}
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" disabled={saving.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" data-testid="no-impact-submit" disabled={saving.isPending}>
          {saving.isPending ? 'Saving…' : 'Mark as no impact'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function LinkVersionDialog({
  change,
  version,
  onClose,
}: {
  change: AdminLegalChangeDetail;
  version: AdminTemplateVersion | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={version !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="link-version-dialog">
        {version && <LinkForm change={change} version={version} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  change,
  version,
  onClose,
}: {
  change: AdminLegalChangeDetail;
  version: AdminTemplateVersion;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const linking = useResolve(
    change,
    () => linkTemplateVersion(change.id, version.id, apiRequest),
    onClose
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        linking.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Resolve by this version</DialogTitle>
        <DialogDescription>
          {change.act.name}, form of {formatDay(change.consolidatedOn)}, is answered by{' '}
          {version.title} version {version.version}. Members read the version’s note under the
          change, and the act’s verified form moves to this one.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-4 space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Template</dt>
          <dd className="break-words">{version.title}</dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd>
            {version.version} · {versionKindLabels[version.kind]}
          </dd>
          <dt className="text-muted-foreground">Registered</dt>
          <dd>{formatDateTime(version.createdAt)}</dd>
          <dt className="text-muted-foreground">Note</dt>
          <dd className="break-words">{version.note ?? '—'}</dd>
        </dl>
        {linking.error && (
          <ErrorNotice testId="link-version-error">{refusalOf(linking.error)}</ErrorNotice>
        )}
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" disabled={linking.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" data-testid="link-version-submit" disabled={linking.isPending}>
          {linking.isPending ? 'Saving…' : 'Resolve the change'}
        </Button>
      </DialogFooter>
    </form>
  );
}
