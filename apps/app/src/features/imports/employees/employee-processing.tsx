import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { AbandonImportDialog } from '../abandon-import-dialog';
import { isRunning, photosLabel, uploadedWhen } from '../import-format';
import { ImportThumbnail } from '../import-thumbnail';
import { useUploadStalled } from '../use-upload-stalled';

type ImportFile = ImportDetail['files'][number];

const steps = [
  'Pregătim fotografiile',
  'Citim fiecare fotografie',
  'Le grupăm pe persoane',
  'Verificăm datele',
] as const;

// The pages are grouped and checked in one step of the pipeline.
const stepOfStatus: Record<string, number> = {
  uploading: -1,
  preparing: 0,
  sorting: 1,
  reading: 1,
  checking: 2,
};

function reachedStep(detail: ImportDetail) {
  if (detail.status === 'failed') {
    if (detail.files.some((file) => file.state === 'read')) return 1;
    return detail.files.every((file) => file.state !== 'uploaded') ? 1 : 0;
  }
  return stepOfStatus[detail.status] ?? steps.length;
}

// Seconds a page takes to be read, from the evaluation of 2026-10-30 (ADR 032).
const secondsPerPage = 9.4;

function remaining(pages: number) {
  const minutes = Math.ceil((pages * secondsPerPage) / 60);
  if (minutes <= 1) return 'Mai durează cam un minut.';
  return `Mai durează cam ${minutes} minute.`;
}

const fileState = (file: ImportFile) =>
  file.state === 'read'
    ? 'read'
    : file.state === 'failed' || file.state === 'set_aside'
      ? 'failed'
      : 'waiting';

export function EmployeeProcessing({
  detail,
  clientId,
}: {
  detail: ImportDetail;
  clientId: string;
}) {
  const navigate = useNavigate();
  const [abandoning, setAbandoning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const running = isRunning(detail.status);
  const stalled = useUploadStalled(detail);
  const reached = reachedStep(detail);
  const files = detail.files;
  const read = files.filter((file) => file.state === 'read').length;
  const failed = files.filter((file) => fileState(file) === 'failed');
  const shown = expanded ? files : files.slice(0, 24);
  const open = !['confirmed', 'abandoned'].includes(detail.status);
  const { scans, scansRead } = detail.progress;
  const title =
    detail.status === 'failed'
      ? 'Importul s-a oprit'
      : detail.status === 'abandoned'
        ? 'Import oprit'
        : detail.status === 'confirmed'
          ? 'Import confirmat'
          : detail.status === 'uploading'
            ? stalled
              ? 'Încărcarea nu s-a terminat'
              : 'Se încarcă fotografiile'
            : 'Citim fișele';

  return (
    <div className="grid gap-6" data-testid="employee-processing">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {photosLabel(files.length)} ale fișelor individuale de instruire, încărcate{' '}
            {uploadedWhen(detail.startedAt ?? detail.createdAt)}
          </p>
        </div>
        {open && (
          <Button variant="outline" size="sm" onClick={() => setAbandoning(true)}>
            {running ? 'Oprește importul' : 'Renunță la import'}
          </Button>
        )}
      </div>
      {running && (
        <Notice variant="info" data-testid="employee-processing-can-leave">
          Poți închide pagina. Importul rămâne pe pagina Angajați a clientului, cu pasul la care a
          ajuns, și îl deschizi de acolo când persoanele sunt gata de verificat.
        </Notice>
      )}
      {stalled && (
        <Notice variant="warning">
          Fotografiile nu au ajuns toate, așa că citirea n-a pornit. Renunță la import și încarcă-le
          din nou.
        </Notice>
      )}
      {detail.status === 'failed' && (
        <Notice variant="destructive" data-testid="employee-processing-failed">
          {detail.failureReason ?? 'Importul s-a oprit din cauza unei erori.'} Renunță la import și
          încearcă din nou.
        </Notice>
      )}
      {detail.status !== 'abandoned' && (
        <Card className="gap-4 px-5 py-4" data-testid="employee-processing-steps">
          <h2 className="sr-only">Pașii importului</h2>
          <ol className="grid gap-3">
            {steps.map((label, index) => {
              const state =
                index < reached
                  ? 'done'
                  : index === reached
                    ? detail.status === 'failed'
                      ? 'failed'
                      : 'current'
                    : 'next';
              return (
                <li
                  key={label}
                  data-state={state}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[1.75rem_minmax(0,14rem)_minmax(0,1fr)]"
                >
                  <span
                    className={cn(
                      'grid size-7 place-items-center rounded-full text-xs font-semibold',
                      state === 'done' && 'bg-primary text-primary-foreground',
                      state === 'current' && 'bg-accent text-accent-foreground',
                      state === 'failed' && 'bg-destructive text-white',
                      state === 'next' && 'border text-muted-foreground'
                    )}
                    aria-hidden="true"
                  >
                    {state === 'done' ? (
                      <Check className="size-4" />
                    ) : state === 'failed' ? (
                      <X className="size-4" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      state === 'next' && 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                  <span className="col-start-2 text-sm text-muted-foreground tabular-nums sm:col-start-3">
                    {index === 0 &&
                      (reached > 0
                        ? failed.length > 0
                          ? `${photosLabel(files.length)}, ${failed.length === 1 ? 'una nu se poate citi' : `${failed.length} nu se pot citi`}`
                          : `${photosLabel(files.length)}, toate se pot deschide`
                        : null)}
                    {index === 1 && reached >= 1 && `${scansRead} din ${scans}`}
                    {index === 2 && 'După nume, CNP și ordinea pozelor'}
                    {index === 3 && 'CNP, posturi, angajați existenți'}
                  </span>
                </li>
              );
            })}
          </ol>
          {running && reached === 1 && scans > 0 && (
            <div className="grid gap-2 rounded-lg bg-muted/50 p-4">
              <p className="text-sm">
                <span className="font-medium tabular-nums">
                  Fotografii citite: {scansRead} din {scans}.
                </span>{' '}
                <span className="text-muted-foreground">
                  Le citim una câte una, ca să nu amestecăm rândurile a două fișe.{' '}
                  {remaining(scans - scansRead)}
                </span>
              </p>
              <Progress
                value={(scansRead / scans) * 100}
                aria-label="Fotografii citite"
                className="h-1.5 max-w-md"
              />
              <p className="text-sm text-muted-foreground">
                Când le citim pe toate, punem la un loc paginile fiecărei persoane. Paginile pe care
                nu le putem lega de nimeni ți le arătăm, să le atribui tu.
              </p>
            </div>
          )}
        </Card>
      )}
      {files.length > 0 && (
        <Card className="gap-3 px-5 py-4" data-testid="employee-processing-photos">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold">Fotografiile</h2>
            <span className="rounded-md bg-secondary px-1.5 text-xs font-medium tabular-nums">
              {files.length}
            </span>
            {reached >= 1 && (
              <span className="text-sm text-muted-foreground tabular-nums sm:ml-auto">
                {read} citite, {files.length - read - failed.length} urmează
              </span>
            )}
          </div>
          <ul
            className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3"
            aria-label="Fotografiile fișelor, în ordinea încărcării"
          >
            {shown.map((file) => {
              const state = fileState(file);
              return (
                <li key={file.id} className="grid gap-1" data-testid="employee-processing-photo">
                  <ImportThumbnail importId={detail.id} file={file} className="h-28 w-full" />
                  <span className="truncate text-xs font-medium">{file.fileName}</span>
                  <span
                    className={cn(
                      'text-xs',
                      state === 'read' && 'text-foreground',
                      state === 'failed' && 'text-destructive',
                      state === 'waiting' && 'text-muted-foreground'
                    )}
                  >
                    {state === 'read'
                      ? 'Citită'
                      : state === 'failed'
                        ? (file.reason ?? 'Nu se poate citi')
                        : 'Urmează'}
                  </span>
                </li>
              );
            })}
          </ul>
          {files.length > shown.length && (
            <Button variant="ghost" size="xs" className="w-fit" onClick={() => setExpanded(true)}>
              Arată toate cele {files.length}
            </Button>
          )}
        </Card>
      )}
      {detail.status === 'confirmed' && (
        <Notice
          variant="success"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/clients/$clientId/employees" params={{ clientId }}>
                Vezi angajații
              </Link>
            </Button>
          }
        >
          Angajații din acest import au fost creați.
        </Notice>
      )}
      <AbandonImportDialog
        importId={abandoning ? detail.id : null}
        running={running}
        employees
        onClose={() => setAbandoning(false)}
        onAbandoned={() =>
          void navigate({ to: '/clients/$clientId/employees', params: { clientId } })
        }
      />
    </div>
  );
}
