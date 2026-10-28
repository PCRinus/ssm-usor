import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Progress } from '@ssm-usor/ui/components/progress';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  FileWarning,
  Image as ImageIcon,
  LoaderCircle,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import {
  getListImportsQueryKey,
  type ImportDetail,
  type ImportDetailFilesItem,
  splitImport,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { AbandonImportDialog } from './abandon-import-dialog';
import {
  documentKindLabels,
  documentsLabel,
  endSentence,
  filesLabel,
  importErrorMessage,
  isRunning,
  isUploadStalled,
  pagesLabel,
  uploadedWhen,
  uploadStallsAt,
  uploadSummary,
} from './import-format';
import { ImportThumbnail } from './import-thumbnail';
import { ReadSetAsideButton } from './read-set-aside-button';
import { useImport } from './use-import';

type ImportFile = ImportDetailFilesItem;

const stepOrder = ['preparing', 'sorting', 'reading', 'checking'] as const;

const sortedStates = new Set(['read', 'set_aside', 'for_employees', 'other_company']);

function failedStep(files: ImportFile[]) {
  if (files.some((file) => sortedStates.has(file.state))) return 2;
  if (files.length > 0 && files.every((file) => file.state !== 'uploaded')) return 1;
  return 0;
}

function reachedStep(detail: ImportDetail) {
  if (detail.status === 'failed') return failedStep(detail.files);
  const index = (stepOrder as readonly string[]).indexOf(detail.status);
  if (index !== -1) return index;
  return detail.status === 'uploading' ? -1 : stepOrder.length;
}

const isScanToRead = (file: ImportFile) =>
  Boolean(file.isScan) && (file.state === 'prepared' || file.state === 'read');

function fileDetail(file: ImportFile) {
  const kind = file.documentKind ? documentKindLabels[file.documentKind] : null;
  const pages = file.pageCount ? pagesLabel(file.pageCount) : null;
  return [kind, pages].filter(Boolean).join(', ');
}

export function ImportLoader({
  importId,
  children,
}: {
  importId: string;
  children: (detail: ImportDetail) => ReactNode;
}) {
  const query = useImport(importId);
  if (query.isPending) {
    return (
      <div className="grid gap-4" data-testid="import-loading" aria-busy="true">
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Notice
        variant="destructive"
        data-testid="import-error"
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Încearcă din nou
          </Button>
        }
      >
        {importErrorMessage(query.error, 'Nu am putut încărca importul. Încearcă din nou.')}
      </Notice>
    );
  }
  return children(query.data.import);
}

function useUploadStalled(detail: ImportDetail) {
  const [now, setNow] = useState(Date.now);
  const stalled = isUploadStalled(detail, now);
  useEffect(() => {
    if (detail.status !== 'uploading' || stalled) return;
    const timer = setTimeout(() => setNow(Date.now()), uploadStallsAt(detail) - Date.now());
    return () => clearTimeout(timer);
  }, [detail, stalled]);
  return stalled;
}

function title(detail: ImportDetail, stalled: boolean) {
  if (isRunning(detail.status)) return 'Citim documentele';
  switch (detail.status) {
    case 'uploading':
      return stalled ? 'Încărcarea nu s-a terminat' : 'Se încarcă fișierele';
    case 'failed':
      return 'Importul s-a oprit';
    case 'abandoned':
      return 'Import oprit';
    case 'confirmed':
      return 'Import confirmat';
    default:
      return 'Fișierele importului';
  }
}

function progressAnnouncement(detail: ImportDetail, stalled: boolean) {
  if (detail.status === 'ready') return 'Propunerea e gata de verificat.';
  if (isRunning(detail.status)) {
    const step = reachedStep(detail);
    return `Pasul ${step + 1} din ${steps.length}: ${steps[step]!.label}.`;
  }
  return `${title(detail, stalled)}.`;
}

export function ProcessingView({ detail }: { detail: ImportDetail }) {
  const navigate = useNavigate();
  const [abandoning, setAbandoning] = useState(false);
  const stalled = useUploadStalled(detail);
  const running = isRunning(detail.status);
  const open = !['confirmed', 'abandoned'].includes(detail.status);
  const files = detail.files;
  const failed = files.filter((file) => file.state === 'failed');
  const sorted = reachedStep(detail) >= 2;
  const documents = files.filter((file) => file.state === 'read' && !file.isScan);
  const scans = files.filter(isScanToRead);
  const forEmployees = files.filter((file) => file.state === 'for_employees');
  const setAside = files.filter((file) => file.state === 'set_aside');
  const otherCompany = files.filter((file) => file.state === 'other_company');
  const unsorted = files.filter((file) => file.state === 'uploaded' || file.state === 'prepared');
  const summary = uploadSummary(files);
  const announcement = progressAnnouncement(detail, stalled);
  // The heading says where the import stands on arrival; only what changes after is announced.
  const [arrivedAt] = useState(announcement);

  return (
    <div data-testid="import-processing" className="grid gap-6">
      <p role="status" className="sr-only" data-testid="import-announcement">
        {announcement === arrivedAt ? '' : announcement}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{title(detail, stalled)}</h1>
          {summary && (
            <p className="text-sm text-muted-foreground" data-testid="import-upload-summary">
              {summary}, încărcate {uploadedWhen(detail.startedAt ?? detail.createdAt)}
            </p>
          )}
        </div>
        {open && (
          <Button
            variant="outline"
            size="sm"
            data-testid="import-abandon"
            onClick={() => setAbandoning(true)}
          >
            {running ? 'Oprește importul' : 'Renunță la import'}
          </Button>
        )}
      </div>
      {running && (
        <Notice variant="info" data-testid="import-can-leave">
          Poți închide pagina. Importul rămâne în lista de clienți, cu pasul la care a ajuns, și îl
          deschizi de acolo când propunerea e gata de verificat.
        </Notice>
      )}
      {detail.status === 'uploading' && !stalled && (
        <Notice variant="info" data-testid="import-upload-underway">
          Fișierele se încarcă din fereastra în care le-ai ales. Citirea pornește când ajung toate,
          iar pagina se actualizează singură.
        </Notice>
      )}
      {stalled && (
        <Notice variant="warning" data-testid="import-upload-unfinished">
          Fișierele nu au ajuns toate, așa că citirea n-a pornit. Renunță la import și încarcă
          documentele din nou.
        </Notice>
      )}
      {detail.status === 'failed' && (
        <Notice variant="destructive" data-testid="import-failed">
          {detail.failureReason ?? 'Importul s-a oprit din cauza unei erori.'} Renunță la el și
          încearcă din nou.
        </Notice>
      )}
      {detail.status === 'confirmed' && detail.client && (
        <Notice
          variant="success"
          data-testid="import-confirmed"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/clients/$clientId/details" params={{ clientId: detail.client.id }}>
                Deschide clientul
              </Link>
            </Button>
          }
        >
          Datele au fost preluate în {endSentence(detail.client.legalName)}
        </Notice>
      )}
      {detail.status === 'ready' && (
        <Notice variant="success" data-testid="import-ready">
          Propunerea e gata de verificat.
        </Notice>
      )}
      {detail.otherCompanies.map((company) => (
        <OtherCompanyNotice
          key={company.fileIds.join()}
          detail={detail}
          company={company}
          ownCount={files.length - otherCompany.length}
        />
      ))}
      {detail.status !== 'abandoned' && <StepsCard detail={detail} />}
      {failed.length > 0 && (
        <FileGroup
          testId="import-group-failed"
          title="Nu le-am putut citi"
          files={failed}
          aside={running ? 'Restul importului merge mai departe fără ele' : undefined}
          render={(file) => (
            <FileRow
              file={file}
              icon={<FileWarning className="size-4 text-destructive" aria-hidden="true" />}
              detail={file.reason ?? 'Fișierul nu a putut fi citit.'}
            />
          )}
        />
      )}
      {!sorted && unsorted.length > 0 && (
        <FileGroup
          testId="import-group-uploaded"
          title="Fișierele încărcate"
          files={unsorted}
          render={(file) => (
            <FileRow
              file={file}
              status={
                file.state === 'prepared' ? (
                  <Status icon={Check}>Pregătit</Status>
                ) : (
                  <Status icon={Clock} muted>
                    Urmează
                  </Status>
                )
              }
            />
          )}
        />
      )}
      {sorted && documents.length > 0 && (
        <FileGroup
          testId="import-group-documents"
          title="Documente"
          files={documents}
          aside={
            detail.status === 'reading' ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                Toate în lucru, se termină împreună
              </span>
            ) : undefined
          }
          render={(file) => (
            <FileRow
              file={file}
              status={
                detail.status === 'reading' ? (
                  <Status muted>În lucru</Status>
                ) : (
                  <Status icon={Check}>Citit</Status>
                )
              }
            />
          )}
        />
      )}
      {sorted && scans.length > 0 && (
        <FileGroup
          testId="import-group-scans"
          title="Scanări și fotografii"
          files={scans}
          aside={
            detail.status === 'reading'
              ? `${scans.filter((file) => file.state === 'read').length} din ${scans.length}, câte una`
              : undefined
          }
          render={(file) => (
            <FileRow
              file={file}
              icon={<ImportThumbnail importId={detail.id} file={file} className="size-8" />}
              status={
                file.state === 'read' ? (
                  <Status icon={Check}>Citit</Status>
                ) : (
                  <Status icon={Clock} muted>
                    Urmează
                  </Status>
                )
              }
            />
          )}
        />
      )}
      {forEmployees.length > 0 && (
        <Card className="gap-3 px-5 py-4" data-testid="import-group-employees">
          <GroupHeading title="Pentru importul angajaților" count={forEmployees.length} />
          <p className="max-w-2xl text-sm text-muted-foreground">
            Fotografii ale fișelor individuale de instruire. Nu le citim acum: le folosim după ce
            clientul e creat, când îi imporți angajații.
          </p>
          <ul className="flex flex-wrap gap-3" aria-label="Fotografii păstrate pentru angajați">
            {forEmployees.map((file) => (
              <li key={file.id} className="grid w-20 gap-1">
                <ImportThumbnail importId={detail.id} file={file} className="h-24 w-20" />
                <span className="truncate text-xs text-muted-foreground">{file.fileName}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {setAside.length > 0 && (
        <FileGroup
          testId="import-group-set-aside"
          title="Puse deoparte"
          files={setAside}
          aside="Instrucțiuni proprii, formulare goale, coperte și texte generale"
          render={(file) => (
            <FileRow
              file={file}
              detail={
                file.reason ??
                (file.documentKind ? documentKindLabels[file.documentKind] : undefined)
              }
              status={
                detail.status === 'ready' ? (
                  <ReadSetAsideButton detail={detail} file={file} />
                ) : undefined
              }
            />
          )}
        />
      )}
      {otherCompany.length > 0 && (
        <FileGroup
          testId="import-group-other-company"
          title="Ale altei firme"
          files={otherCompany}
          render={(file) => <FileRow file={file} detail={file.reason ?? undefined} />}
        />
      )}
      <AbandonImportDialog
        importId={abandoning ? detail.id : null}
        running={running}
        onClose={() => setAbandoning(false)}
        onAbandoned={() => void navigate({ to: '/clients' })}
      />
    </div>
  );
}

function OtherCompanyNotice({
  detail,
  company,
  ownCount,
}: {
  detail: ImportDetail;
  company: ImportDetail['otherCompanies'][number];
  ownCount: number;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const count = company.fileIds.length;
  const other = company.name ?? `CUI ${company.cui}`;
  const own = detail.client?.legalName ?? detail.companyName;

  async function split() {
    setState('sending');
    try {
      const { import: created } = await splitImport(
        detail.id,
        { fileIds: company.fileIds },
        apiRequest
      );
      setState('done');
      await queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
      toast.success(`Am pornit un import separat pentru ${endSentence(other)}`, {
        action: {
          label: 'Vezi importul',
          onClick: () =>
            void navigate({ to: '/clients/import/$importId', params: { importId: created.id } }),
        },
      });
    } catch (cause) {
      setState('idle');
      toast.error(
        importErrorMessage(cause, 'Importul separat nu a putut porni. Încearcă din nou.')
      );
    }
  }

  return (
    <Notice
      variant="warning"
      data-testid="import-other-company"
      action={
        <Button
          variant="outline"
          size="sm"
          className="border-warning-border bg-card"
          data-testid="import-split"
          disabled={state !== 'idle'}
          onClick={() => void split()}
        >
          {state === 'done'
            ? 'Import separat pornit'
            : count === 1
              ? 'Importă-l separat'
              : `Importă-le separat pe cele ${count}`}
        </Button>
      }
    >
      <strong className="font-semibold">
        {detail.intoExistingClient
          ? 'Unele documente sunt ale altei firme.'
          : 'Am găsit documentele a două firme.'}
      </strong>{' '}
      {detail.intoExistingClient
        ? `${count === 1 ? 'Un fișier este' : `${filesLabel(count)} sunt`} ale firmei ${other}, nu ale clientului, așa că nu le citim.`
        : `${own ? `${capitalized(filesLabel(ownCount))} ${ownCount === 1 ? 'este al' : 'sunt ale'} firmei ${own} și ` : ''}${count === 1 ? 'unul al' : `${count} ale`} firmei ${endSentence(other)} Un import creează un singur client, așa că acum le citim doar pe ${own ? 'primele' : 'ale firmei principale'}.`}
    </Notice>
  );
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Step = { label: string; detail: (detail: ImportDetail) => string | null };

function countsAfterSorting(files: ImportFile[]) {
  const toRead = files.filter(
    (file) => file.state === 'read' || (file.isScan && file.state === 'prepared')
  ).length;
  const parts = [`${toRead} de citit`];
  const employees = files.filter((file) => file.state === 'for_employees').length;
  const aside = files.filter((file) => file.state === 'set_aside').length;
  const other = files.filter((file) => file.state === 'other_company').length;
  if (employees > 0)
    parts.push(employees === 1 ? 'o fișă de angajat' : `${employees} fișe de angajați`);
  if (aside > 0) parts.push(`${aside} deoparte`);
  if (other > 0) parts.push(`${other} ale altei firme`);
  return parts.join(', ');
}

const steps: Step[] = [
  {
    label: 'Pregătim fișierele',
    detail: ({ files, status }) => {
      const failed = files.filter((file) => file.state === 'failed').length;
      if (status === 'preparing') {
        return `${files.filter((file) => file.state !== 'uploaded').length} din ${files.length}`;
      }
      return failed > 0
        ? `${filesLabel(files.length)}, ${failed === 1 ? 'unul nu se poate citi' : `${failed} nu se pot citi`}`
        : filesLabel(files.length);
    },
  },
  {
    label: 'Le sortăm',
    detail: ({ files, status }) => (status === 'sorting' ? 'În lucru' : countsAfterSorting(files)),
  },
  {
    label: 'Citim documentația',
    detail: ({ status }) => (status === 'reading' ? 'În lucru' : null),
  },
  {
    label: 'Verificăm datele',
    detail: ({ status }) => (status === 'checking' ? 'În lucru' : 'CUI, CNP, ANAF și sursele'),
  },
];

function StepsCard({ detail }: { detail: ImportDetail }) {
  const reached = reachedStep(detail);
  const failed = detail.status === 'failed';
  const documents = detail.files.filter((file) => file.state === 'read' && !file.isScan).length;
  const scans = detail.files.filter(isScanToRead);
  const scansRead = scans.filter((file) => file.state === 'read').length;
  return (
    <Card className="gap-4 px-5 py-4" data-testid="import-steps">
      <h2 className="text-lg font-semibold">Pașii importului</h2>
      <ol className="grid gap-3">
        {steps.map((step, index) => {
          const state =
            index < reached ? 'done' : index === reached ? (failed ? 'failed' : 'current') : 'next';
          const text = state === 'next' && index < 3 ? null : step.detail(detail);
          return (
            <li
              key={step.label}
              data-testid="import-step"
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
                className={cn('text-sm font-medium', state === 'next' && 'text-muted-foreground')}
              >
                {step.label}
              </span>
              {text && (
                <span className="col-start-2 text-sm text-muted-foreground tabular-nums sm:col-start-3">
                  {text}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {isRunning(detail.status) && (
        <div className="grid gap-4 rounded-lg bg-muted/50 p-4" data-testid="import-now">
          {detail.status === 'preparing' && (
            <NowRow
              text={`Am pregătit ${detail.files.filter((file) => file.state !== 'uploaded').length} din ${filesLabel(detail.files.length)}.`}
              value={
                (detail.files.filter((file) => file.state !== 'uploaded').length /
                  Math.max(1, detail.files.length)) *
                100
              }
              label="Fișiere pregătite"
            />
          )}
          {detail.status === 'sorting' && (
            <NowRow
              text="Le sortăm pe toate deodată."
              hint="Durează de obicei câteva secunde."
              label="Sortarea fișierelor, în lucru"
            />
          )}
          {detail.status === 'reading' && documents > 0 && (
            <NowRow
              text={
                documents === 1
                  ? 'Citim documentul.'
                  : `Citim cele ${documentsLabel(documents)} împreună.`
              }
              hint="Durează de obicei un minut sau două."
              label="Citirea documentelor, în lucru"
            />
          )}
          {detail.status === 'reading' && scans.length > 0 && (
            <NowRow
              text={`Scanări: ${scansRead} din ${scans.length}.`}
              hint="Scanările și fotografiile le citim una câte una."
              value={(scansRead / scans.length) * 100}
              label="Scanări citite"
            />
          )}
          {detail.status === 'checking' && (
            <NowRow
              text="Verificăm CUI-ul, CNP-urile, datele de la ANAF și sursa fiecărei valori."
              label="Verificarea datelor, în lucru"
            />
          )}
        </div>
      )}
    </Card>
  );
}

function NowRow({
  text,
  hint,
  value,
  label,
}: {
  text: string;
  hint?: string;
  value?: number;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        <span className="font-medium tabular-nums">{text}</span>
        {hint && <span className="text-muted-foreground"> {hint}</span>}
      </p>
      {value === undefined ? (
        <div
          role="progressbar"
          aria-label={label}
          className="h-1.5 w-full max-w-md animate-pulse rounded-full bg-primary/40"
        />
      ) : (
        <Progress value={value} aria-label={label} className="h-1.5 max-w-md" />
      )}
    </div>
  );
}

function GroupHeading({
  title,
  count,
  aside,
}: {
  title: string;
  count: number;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 className="text-base font-semibold">{title}</h2>
      <span className="rounded-md bg-secondary px-1.5 text-xs font-medium tabular-nums">
        {count}
      </span>
      {aside && <span className="text-sm text-muted-foreground sm:ml-auto">{aside}</span>}
    </div>
  );
}

const shownPerGroup = 4;

function FileGroup({
  testId,
  title,
  files,
  aside,
  render,
}: {
  testId: string;
  title: string;
  files: ImportFile[];
  aside?: ReactNode;
  render: (file: ImportFile) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? files : files.slice(0, shownPerGroup);
  return (
    <Card className="gap-2 px-5 py-4" data-testid={testId}>
      <GroupHeading title={title} count={files.length} aside={aside} />
      <ul className="divide-y">
        {shown.map((file) => (
          <li key={file.id} data-testid="import-file-row">
            {render(file)}
          </li>
        ))}
      </ul>
      {files.length > shownPerGroup && (
        <Button variant="ghost" size="xs" className="w-fit" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {expanded ? 'Arată mai puține' : `Arată toate cele ${files.length}`}
        </Button>
      )}
    </Card>
  );
}

function FileRow({
  file,
  icon,
  detail,
  status,
}: {
  file: ImportFile;
  icon?: ReactNode;
  detail?: string;
  status?: ReactNode;
}) {
  const shownDetail = detail ?? fileDetail(file);
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      {icon ?? (
        <span className="grid size-8 place-items-center rounded-md bg-secondary" aria-hidden="true">
          {file.mimeType.startsWith('image/') ? (
            <ImageIcon className="size-4" />
          ) : (
            <FileText className="size-4" />
          )}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium" title={file.uploadPath}>
          {file.fileName}
        </span>
        {shownDetail && <span className="block text-xs text-muted-foreground">{shownDetail}</span>}
      </span>
      {status ?? <span />}
    </div>
  );
}

function Status({
  icon: Icon,
  muted = false,
  children,
}: {
  icon?: typeof Check;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs whitespace-nowrap',
        muted ? 'text-muted-foreground' : 'font-medium'
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}
