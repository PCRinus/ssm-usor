import { fileAddress, linkTarget } from '@ssm-usor/api-http/file-link';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Progress } from '@ssm-usor/ui/components/progress';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { BookOpen, Check, FileText, FileUp, Plus, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  clearEarlierInstructionsUnavailable,
  markEarlierInstructionsUnavailable,
} from '@/api/generated/api';
import { DatePicker } from '@/components/date-picker';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { DeleteClientFileDialog } from '@/features/client-files/client-file-dialogs';
import {
  type ClientFile,
  clientFileAccept,
  formatFileSize,
} from '@/features/client-files/client-file-format';
import {
  answered,
  type EarlierInstructions,
  type InlineUpload,
  instructionsName,
  todayIso,
  useChangeValidUntil,
  useEarlierInstructions,
  useEarlierInstructionsUploads,
  useRefreshEarlierInstructions,
} from '@/features/client-files/earlier-instructions';
import { useFileDrop } from '@/features/client-files/use-file-drop';

import { SectionHeader, Tag } from '../review-parts';
import { sheetTrainingCounts } from './earlier-instructions-counts';
import type { PersonView, ReviewContext } from './employee-review-model';
import { trainingsLabel } from './review-format';

const earlierInstructionsSectionId = 'employee-hub-earlier-instructions-heading';

const longDate = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const validityHint =
  '„Valabile până la” e ziua din care se aplică instrucțiunile noi. Propunem ziua de azi.';

export function EarlierInstructionsSection({
  clientId,
  context,
  views,
}: {
  clientId: string;
  context: ReviewContext;
  views: PersonView[];
}) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const state = useEarlierInstructions(clientId, userId);
  const uploads = useEarlierInstructionsUploads(clientId);
  const [deleting, setDeleting] = useState<ClientFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useRefreshEarlierInstructions(clientId);
  const counts = sheetTrainingCounts(context, views);
  const domains = (state.data?.domains ?? []).filter((domain) => counts[domain.domain] > 0);
  if (domains.length === 0) return null;
  const allImported = domains.every((domain) => domain.state === 'imported');
  const allAnswered = domains.every(answered);
  const dated = domains.some((domain) => domain.state === 'missing' || domain.state === 'added');
  return (
    <section aria-labelledby={earlierInstructionsSectionId} className="scroll-mt-24">
      <Card className="gap-0 overflow-hidden py-0" data-testid="employee-hub-earlier-instructions">
        <div className="border-b px-4 py-4 sm:px-5">
          <SectionHeader
            headingId={earlierInstructionsSectionId}
            icon={BookOpen}
            title="Instrucțiunile proprii anterioare"
            description={
              allImported ? (
                'Fișele trimit la articole din instrucțiunile proprii pe care clientul le avea atunci. Sunt deja păstrate, lângă celelalte fișiere ale clientului.'
              ) : (
                <>
                  Fișele trimit la articole din instrucțiunile proprii pe care clientul le avea
                  atunci, de exemplu „IPSSM, art. 167–288”, nu din cele pe care le generezi aici.
                  Păstrate lângă fișe, arată ce s-a predat, la un control sau la cercetarea unui
                  accident. Nu e o obligație legală și nu oprește importul.{' '}
                  <HelpLink topic="import.instructiuni-anterioare">Află mai mult</HelpLink>
                </>
              )
            }
            status={
              allAnswered ? (
                <Tag tone="success" icon={<Check aria-hidden="true" />} testId="section-status">
                  {allImported ? 'Le avem' : 'Răspuns'}
                </Tag>
              ) : (
                <Tag tone="muted" testId="section-status">
                  Opțional
                </Tag>
              )
            }
          />
        </div>
        {error && (
          <div className="border-b px-4 py-3 sm:px-5">
            <Notice variant="destructive" data-testid="earlier-instructions-error">
              {error}
            </Notice>
          </div>
        )}
        <ul className="divide-y">
          {domains.map((domain) => (
            <DomainRow
              key={domain.domain}
              clientId={clientId}
              domain={domain}
              count={counts[domain.domain]}
              uploads={uploads.uploads.filter((upload) => upload.domain === domain.domain)}
              onUpload={(files, validUntil) =>
                void uploads.upload(files, domain.domain, validUntil)
              }
              onDismiss={uploads.dismiss}
              onDelete={setDeleting}
              onError={setError}
            />
          ))}
        </ul>
        {dated && (
          <p className="border-t px-4 pt-2.5 pb-3 text-xs text-muted-foreground sm:pr-5 sm:pl-[4.625rem]">
            {validityHint}
          </p>
        )}
      </Card>
      <DeleteClientFileDialog
        clientId={clientId}
        file={deleting}
        personal={false}
        onClose={() => {
          setDeleting(null);
          void refresh();
        }}
        onError={setError}
      />
    </section>
  );
}

function DomainRow({
  clientId,
  domain,
  count,
  uploads,
  onUpload,
  onDismiss,
  onDelete,
  onError,
}: {
  clientId: string;
  domain: EarlierInstructions;
  count: number;
  uploads: InlineUpload[];
  onUpload: (files: File[], validUntil: string) => void;
  onDismiss: (key: string) => void;
  onDelete: (file: ClientFile) => void;
  onError: (message: string | null) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const refresh = useRefreshEarlierInstructions(clientId);
  const changeValidUntil = useChangeValidUntil(clientId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const fileDays = domain.files.map((file) => file.earlierInstructions?.validUntil ?? '').sort();
  const [day, setDay] = useState(() => fileDays.at(-1) || todayIso());
  const name = instructionsName[domain.domain];
  const drop = useFileDrop((files) => {
    if (files.length > 0 && day) onUpload(files, day);
  });
  const shownDay = domain.files.length > 0 ? fileDays.at(-1)! : day;

  async function answer(unavailable: boolean) {
    onError(null);
    setPending(true);
    try {
      if (unavailable) {
        await markEarlierInstructionsUnavailable(clientId, domain.domain, apiRequest);
      } else {
        await clearEarlierInstructionsUnavailable(clientId, domain.domain, apiRequest);
      }
    } catch {
      onError('Nu am putut salva răspunsul. Verifică conexiunea și încearcă din nou.');
    }
    await refresh();
    setPending(false);
  }

  async function changeDay(value: string) {
    setDay(value);
    if (!value || domain.files.length === 0) return;
    const changed = domain.files.filter(
      (file) => file.canChange && file.earlierInstructions?.validUntil !== value
    );
    if (changed.length === 0) return;
    onError(null);
    try {
      await changeValidUntil(
        changed.map((file) => file.id),
        value
      );
      toast.success(`Ziua s-a schimbat la ${name}.`);
    } catch {
      onError('Nu am putut schimba ziua. Verifică conexiunea și încearcă din nou.');
    }
  }

  const heading = (
    <span className="grid content-start gap-0.5">
      <h3 className="font-semibold">{name}</h3>
      {domain.state !== 'imported' && (
        <span className="text-[13px] text-muted-foreground tabular-nums">
          la ele trimit {trainingsLabel(count)}
        </span>
      )}
    </span>
  );

  const picker = (
    <input
      ref={fileInput}
      type="file"
      multiple
      className="hidden"
      data-testid="earlier-instructions-input"
      accept={clientFileAccept}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (files.length > 0 && day) onUpload(files, day);
      }}
    />
  );

  const dayField = (
    <div className="grid content-start gap-1.5">
      <label
        htmlFor={`earlier-instructions-day-${domain.domain}`}
        className="text-[13px] leading-none font-medium"
      >
        Valabile până la
      </label>
      <DatePicker
        id={`earlier-instructions-day-${domain.domain}`}
        testId="earlier-instructions-day"
        value={shownDay}
        onChange={(value) => void changeDay(value)}
        required
      />
    </div>
  );

  const rowClass =
    'grid gap-3 px-4 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)_12.5rem_auto] sm:items-center sm:gap-x-5 sm:pr-5 sm:pl-[4.625rem]';

  if (domain.state === 'imported') {
    return (
      <li
        className={cn(rowClass, 'sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start')}
        data-testid="earlier-instructions-domain"
        data-domain={domain.domain}
        data-state="imported"
      >
        {heading}
        <span className="grid min-w-0 gap-1.5 text-sm">
          <span className="flex items-center gap-2">
            <Check aria-hidden="true" className="size-4 text-success-foreground" />
            Le avem din documentația importată pe{' '}
            {longDate.format(new Date(`${domain.imported!.confirmedOn}T00:00:00Z`))}
          </span>
          {domain.imported!.files.map((file) => (
            <FileLink key={file.id} file={file} />
          ))}
        </span>
      </li>
    );
  }

  if (domain.state === 'unavailable') {
    return (
      <li
        className={cn(rowClass, 'sm:grid-cols-[9rem_minmax(0,1fr)_auto]')}
        data-testid="earlier-instructions-domain"
        data-domain={domain.domain}
        data-state="unavailable"
      >
        {heading}
        <span className="text-sm text-muted-foreground">Ai răspuns că nu le ai.</span>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit max-sm:-ml-2.5"
          data-testid="earlier-instructions-change"
          disabled={pending}
          aria-label={`Schimbă răspunsul pentru ${name}`}
          onClick={() => void answer(false)}
        >
          Schimbă răspunsul
        </Button>
      </li>
    );
  }

  const added = domain.state === 'added';
  return (
    <li
      className={cn(rowClass, added && 'sm:items-start')}
      data-testid="earlier-instructions-domain"
      data-domain={domain.domain}
      data-state={domain.state}
      {...drop.handlers}
    >
      {heading}
      <div className="grid min-w-0 gap-2">
        {domain.files.map((file) => (
          <div
            key={file.id}
            data-testid="earlier-instructions-file"
            className="flex min-h-12 min-w-0 items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-3"
          >
            <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <FileLink file={file} bare />
            <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
              {formatFileSize(file.sizeBytes)}
            </span>
            <span className="flex-1" />
            {file.canChange && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="earlier-instructions-remove"
                aria-label={`Scoate ${file.name}`}
                onClick={() => onDelete(file)}
              >
                <X aria-hidden="true" />
                Scoate
              </Button>
            )}
          </div>
        ))}
        {uploads.map((upload) => (
          <UploadRow key={upload.key} upload={upload} onDismiss={() => onDismiss(upload.key)} />
        ))}
        {added ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit -ml-2.5"
            data-testid="earlier-instructions-add-more"
            aria-label={`Adaugă încă un fișier la ${name}`}
            onClick={() => fileInput.current?.click()}
          >
            <Plus aria-hidden="true" />
            Adaugă încă un fișier
          </Button>
        ) : (
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground sm:min-h-13 sm:rounded-lg sm:border sm:border-dashed sm:px-3 sm:py-2',
              drop.dragging && 'sm:border-primary sm:bg-primary/5'
            )}
          >
            <FileUp aria-hidden="true" className="size-4 max-sm:hidden" />
            <span className="max-sm:hidden">Trage fișierul aici sau</span>
            <Button
              variant="outline"
              size="sm"
              data-testid="earlier-instructions-add"
              aria-label={`Adaugă fișierul cu ${name}`}
              onClick={() => fileInput.current?.click()}
            >
              <Upload aria-hidden="true" />
              Adaugă fișierul
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sm:hidden"
              data-testid="earlier-instructions-none"
              disabled={pending}
              aria-label={`Nu le am: clientul nu are ${name} anterioare`}
              onClick={() => void answer(true)}
            >
              Nu le am
            </Button>
          </div>
        )}
        {picker}
      </div>
      {dayField}
      {added ? (
        <span className="max-sm:hidden" />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="max-sm:hidden"
          data-testid="earlier-instructions-none"
          disabled={pending}
          aria-label={`Nu le am: clientul nu are ${name} anterioare`}
          onClick={() => void answer(true)}
        >
          Nu le am
        </Button>
      )}
    </li>
  );
}

function FileLink({ file, bare = false }: { file: ClientFile; bare?: boolean }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const disposition = file.link.disposition;
  return (
    <span className={cn('flex min-w-0 items-center gap-2', bare && 'contents')}>
      {!bare && <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
      <a
        href={fileAddress(apiRequest.baseUrl, file.link, disposition)}
        target={linkTarget(disposition)}
        data-testid="earlier-instructions-file-link"
        className="min-w-0 font-medium wrap-anywhere underline-offset-4 hover:underline"
      >
        {file.originalFileName}
      </a>
    </span>
  );
}

function UploadRow({ upload, onDismiss }: { upload: InlineUpload; onDismiss: () => void }) {
  return (
    <div
      data-testid="earlier-instructions-upload"
      className={cn(
        'grid gap-1.5 rounded-lg border px-3 py-2',
        upload.error && 'border-destructive/50'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-medium">{upload.name}</span>
        <span className="flex-1" />
        {upload.error ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Scoate ${upload.name} din listă`}
            onClick={onDismiss}
          >
            <X aria-hidden="true" />
          </Button>
        ) : (
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {upload.percent < 100 ? `${upload.percent}%` : 'Se verifică…'}
          </span>
        )}
      </div>
      {upload.error ? (
        <p role="alert" className="text-sm text-destructive">
          {upload.error}
        </p>
      ) : (
        <Progress
          value={upload.percent}
          className="h-1.5"
          aria-label={`Se încarcă ${upload.name}`}
        />
      )}
    </div>
  );
}
