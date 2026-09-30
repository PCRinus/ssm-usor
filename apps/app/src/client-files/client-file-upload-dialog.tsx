import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, File as FileIcon, FileUp, Upload, X } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';

import { Notice } from '@/components/notice';

import {
  chosenFileKind,
  clientFileAccept,
  fileCountLabel,
  formatFileSize,
} from './client-file-format';
import { type ChosenFile, useClientFileUploads } from './use-client-file-uploads';
import { useFileDrop } from './use-file-drop';

// `files` is null while the dialog is closed, and holds the files dropped on the card to open it.
export function UploadClientFilesDialog({
  clientId,
  lead,
  canChooseOwnersOnly,
  files,
  onClose,
}: {
  clientId: string;
  lead: boolean;
  canChooseOwnersOnly: boolean;
  files: File[] | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={files !== null} onOpenChange={(open) => !open && onClose()}>
      {files && (
        <UploadForm
          clientId={clientId}
          lead={lead}
          canChooseOwnersOnly={canChooseOwnersOnly}
          initialFiles={files}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function uploadLabel(count: number) {
  if (count === 0) return 'Încarcă fișiere';
  if (count === 1) return 'Încarcă fișierul';
  return `Încarcă ${fileCountLabel(count)}`;
}

function UploadForm({
  clientId,
  lead,
  canChooseOwnersOnly,
  initialFiles,
  onClose,
}: {
  clientId: string;
  lead: boolean;
  canChooseOwnersOnly: boolean;
  initialFiles: File[];
  onClose: () => void;
}) {
  const { chosen, phase, add, remove, start } = useClientFileUploads(
    clientId,
    initialFiles,
    onClose
  );
  const [ownersOnly, setOwnersOnly] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const drop = useFileDrop(add);
  const choosing = phase === 'choosing';
  const sending = phase === 'sending';
  const readyCount = chosen.filter((entry) => entry.state === 'ready').length;
  const failedCount = chosen.filter((entry) => entry.state === 'failed').length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start(canChooseOwnersOnly && ownersOnly);
  }

  // No cancel while sending: a request cut off late may still have stored its file.
  const holdOpen = (event: Event) => {
    if (sending) event.preventDefault();
  };

  return (
    <DialogContent
      data-testid="client-files-upload-dialog"
      className="sm:max-w-lg"
      aria-describedby={undefined}
      showCloseButton={!sending}
      onEscapeKeyDown={holdOpen}
      onInteractOutside={holdOpen}
    >
      <form onSubmit={onSubmit} aria-busy={sending} noValidate>
        <DialogHeader>
          <DialogTitle>Încarcă fișiere</DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-4 grid gap-5">
          {phase === 'finished' && failedCount > 0 && (
            <Notice variant="destructive" data-testid="client-files-upload-failed">
              {failedCount === 1
                ? 'Un fișier nu a fost încărcat. Motivul este scris sub numele lui.'
                : `${fileCountLabel(failedCount)} nu au fost încărcate. Motivul este scris sub numele fiecăruia.`}
            </Notice>
          )}
          {choosing && (
            <div
              data-testid="client-files-upload-drop"
              className={cn(
                'grid justify-items-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors',
                drop.dragging && 'border-primary bg-primary/5'
              )}
              {...drop.handlers}
            >
              <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Trage fișierele aici sau</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="client-files-choose"
                onClick={() => fileInput.current?.click()}
              >
                <Upload aria-hidden="true" />
                Alege fișiere
              </Button>
              <p className="text-xs text-muted-foreground">
                PDF, imagini, Word sau Excel, de cel mult 20 MB fiecare.
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                data-testid="client-files-input"
                className="hidden"
                accept={clientFileAccept}
                onChange={(event) => {
                  add(Array.from(event.target.files ?? []));
                  // Emptied, so that choosing the same file again is still a change.
                  event.target.value = '';
                }}
              />
            </div>
          )}
          {chosen.length > 0 && (
            <ul className="grid gap-2" aria-label="Fișiere alese">
              {chosen.map((entry) => (
                <ChosenFileRow
                  key={entry.key}
                  entry={entry}
                  removable={choosing}
                  onRemove={() => remove(entry.key)}
                />
              ))}
            </ul>
          )}
          {canChooseOwnersOnly && (
            <div className="flex items-start gap-3">
              <Checkbox
                id="client-files-owners-only"
                data-testid="client-files-owners-only"
                className="mt-0.5"
                checked={ownersOnly}
                disabled={!choosing}
                aria-describedby="client-files-owners-only-hint"
                onCheckedChange={(checked) => setOwnersOnly(checked === true)}
              />
              <div className="grid gap-0.5">
                <label htmlFor="client-files-owners-only" className="text-sm font-medium">
                  Doar pentru administratori
                </label>
                <p id="client-files-owners-only-hint" className="text-xs text-muted-foreground">
                  Se aplică tuturor fișierelor din listă. Specialiștii nu le vor vedea.
                </p>
              </div>
            </div>
          )}
          {lead && (
            <p
              data-testid="client-files-upload-lead-hint"
              className="text-sm text-muted-foreground"
            >
              Până devine client, fișierele lui sunt vizibile doar administratorilor.
            </p>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          {phase === 'finished' ? (
            <Button
              type="button"
              variant="ghost"
              data-testid="client-files-upload-close"
              onClick={onClose}
            >
              Închide
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" disabled={sending} onClick={onClose}>
                Renunță
              </Button>
              <Button
                type="submit"
                data-testid="client-files-upload-submit"
                disabled={sending || readyCount === 0}
              >
                {sending ? 'Se încarcă…' : uploadLabel(readyCount)}
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ChosenFileRow({
  entry,
  removable,
  onRemove,
}: {
  entry: ChosenFile;
  removable: boolean;
  onRemove: () => void;
}) {
  const { file, state } = entry;
  const kind = chosenFileKind(file.name);
  const Icon = kind?.icon ?? FileIcon;
  const details = [kind?.label, file.size > 0 && formatFileSize(file.size)].filter(Boolean);
  const inFlight = state === 'waiting' || state === 'sending';
  return (
    <li
      data-testid="client-file-upload"
      data-state={state}
      className={cn(
        'grid gap-2 rounded-lg border p-3',
        (state === 'refused' || state === 'failed') && 'border-destructive/50'
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium wrap-anywhere">{file.name}</span>
          {details.length > 0 && (
            <span className="text-xs text-muted-foreground">{details.join(' · ')}</span>
          )}
        </div>
        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-my-1.5 -mr-1.5"
            data-testid="client-file-upload-remove"
            aria-label={`Scoate ${file.name} din listă`}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </Button>
        ) : inFlight ? (
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {state === 'waiting'
              ? 'În așteptare'
              : entry.percent < 100
                ? `${entry.percent}%`
                : 'Se verifică…'}
          </span>
        ) : state === 'uploaded' ? (
          <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
            <Check className="size-3.5" aria-hidden="true" />
            Încărcat
          </span>
        ) : null}
      </div>
      {entry.error ? (
        <p data-testid="client-file-upload-error" role="alert" className="text-sm text-destructive">
          {entry.error}
        </p>
      ) : (
        inFlight && (
          <Progress
            value={entry.percent}
            className="h-1.5"
            aria-label={`Se încarcă ${file.name}`}
          />
        )
      )}
    </li>
  );
}
