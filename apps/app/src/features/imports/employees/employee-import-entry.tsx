import { countOf } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  CircleAlert,
  FileCheck2,
  LoaderCircle,
  PenLine,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import {
  getListImportsQueryKey,
  type ImportListResponseItemsItem,
  useListImports,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { openedFromRecord, openedHere } from '@/app/opener';
import { Masked } from '@/components/replay';
import { useBulkInvite } from '@/features/participants/use-bulk-invite';
import { uninvitedOf, useImportInvitees } from '@/features/participants/use-import-invitees';
import { useEmployeesBlocked } from '@/features/subscription/employees-over-step';
import { shortDayMonthFormat } from '@/lib/dates';

import {
  endSentence,
  importListPollMs,
  isRunning,
  isUploadUnderway,
  photosLabel,
} from '../import-format';
import { WayBadge, wayClass } from '../start-ways';
import {
  type EmployeesImported,
  forgetEmployeesImported,
  hideHere,
  importedSentence,
  joinNames,
  readEmployeesImported,
  wasHiddenHere,
} from './employees-imported-notice';
import { type FoundBatch, foundOn, useFoundSheets } from './found-sheets';
import { FoundStrip } from './found-strip';

export type StartImport = (way: 'found' | 'new') => void;

const allSheets = (batches: FoundBatch[]) => batches.flatMap((batch) => batch.sheets);

export function EmployeeImportButtons({
  clientId,
  onStart,
}: {
  clientId: string;
  onStart: StartImport;
}) {
  const found = useFoundSheets(clientId);
  const count = found.data?.total ?? 0;
  const blocked = useEmployeesBlocked();
  return (
    <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
      {blocked ? (
        <Button variant="outline" disabled data-testid="employees-add">
          <PenLine aria-hidden="true" />
          Adaugă manual
        </Button>
      ) : (
        <Button variant="outline" asChild>
          <Link
            to="/clienti/$clientId/angajati/nou"
            params={{ clientId }}
            state={openedHere}
            data-testid="employees-add"
          >
            <PenLine aria-hidden="true" />
            Adaugă manual
          </Link>
        </Button>
      )}
      {count > 0 ? (
        <>
          <Button variant="outline" data-testid="employees-import" onClick={() => onStart('new')}>
            <Sparkles aria-hidden="true" />
            Adaugă cu AI din fotografii noi
          </Button>
          <Button
            className="max-sm:h-auto max-sm:min-h-9 max-sm:py-2 max-sm:whitespace-normal"
            data-testid="employees-import-found"
            onClick={() => onStart('found')}
          >
            <Sparkles aria-hidden="true" />
            Adaugă cu AI din fișele găsite ({photosLabel(count)})
          </Button>
        </>
      ) : (
        <Button data-testid="employees-import" onClick={() => onStart('new')}>
          <Sparkles aria-hidden="true" />
          Adaugă cu AI din fișe
        </Button>
      )}
    </div>
  );
}

export function EmployeeStartWays({
  clientId,
  onStart,
}: {
  clientId: string;
  onStart: StartImport;
}) {
  const found = useFoundSheets(clientId);
  const batches = found.data?.items ?? [];
  const sheets = allSheets(batches);
  const blocked = useEmployeesBlocked();
  const addFirst = (
    <>
      <WayBadge>
        <PenLine className="size-5" />
      </WayBadge>
      <span className="text-[15px] font-semibold">Adaugă manual</span>
      <span className="text-sm leading-snug text-muted-foreground">
        Completezi tu datele persoanei, pornind de la nume și post.
      </span>
    </>
  );
  return (
    <div className="grid w-full max-w-[40rem] gap-3 text-left" data-testid="employees-start-ways">
      {sheets.length > 0 && (
        <button
          type="button"
          className={cn(wayClass, 'border-primary/40')}
          data-testid="employees-start-found"
          onClick={() => onStart('found')}
        >
          <WayBadge primary>
            <Sparkles className="size-5" />
          </WayBadge>
          <span className="text-[15px] font-semibold">
            Adaugă cu AI din fișele găsite în documentație
          </span>
          <span className="grid gap-2.5">
            <span className="text-sm leading-snug text-muted-foreground">
              Ai deja {photosLabel(sheets.length)} de fișe, din documentația importată pe{' '}
              {foundOn(batches[0]!)}. Pornim de la ele; poți adăuga și altele.
            </span>
            <FoundStrip clientId={clientId} sheets={sheets} />
          </span>
        </button>
      )}
      <button
        type="button"
        className={cn(wayClass, sheets.length === 0 && 'border-primary/40')}
        data-testid="employees-start-import"
        onClick={() => onStart('new')}
      >
        <WayBadge primary={sheets.length === 0}>
          <Sparkles className="size-5" />
        </WayBadge>
        <span className="text-[15px] font-semibold">
          {sheets.length > 0 ? 'Adaugă cu AI din fotografii noi' : 'Adaugă primul lucrător cu AI'}
        </span>
        <span className="text-sm leading-snug text-muted-foreground">
          Fotografiezi fișele individuale pe hârtie, iar AI-ul îți propune lucrătorii și instruirile
          lor.
        </span>
      </button>
      {blocked ? (
        <div
          aria-disabled="true"
          data-testid="employees-start-add"
          className={cn(wayClass, 'pointer-events-none opacity-60')}
        >
          {addFirst}
        </div>
      ) : (
        <Link
          to="/clienti/$clientId/angajati/nou"
          params={{ clientId }}
          state={openedHere}
          className={wayClass}
          data-testid="employees-start-add"
        >
          {addFirst}
        </Link>
      )}
    </div>
  );
}

export function OpenEmployeeImports({ clientId }: { clientId: string }) {
  const { request, ready, key } = useApi();
  const params = { clientId, kind: 'employees' as const };
  const imports = useListImports(params, {
    request,
    query: {
      queryKey: key(getListImportsQueryKey(params)),
      enabled: ready,
      refetchInterval: (query) =>
        query.state.data?.items.some((item) => isRunning(item.status) || isUploadUnderway(item))
          ? importListPollMs
          : false,
    },
  });
  const items = imports.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="divide-y border-b" data-testid="employee-imports">
      {items.map((item) => (
        <OpenImportLine key={item.id} clientId={clientId} item={item} />
      ))}
    </div>
  );
}

const until = (expiresAt: string | null) =>
  expiresAt ? `, până pe ${shortDayMonthFormat.format(new Date(expiresAt))}` : '';

function readyText(item: ImportListResponseItemsItem): ReactNode {
  const toCheck = item.people?.toCheck ?? 0;
  if (toCheck === 0)
    return endSentence(`Un import din fișe așteaptă crearea lucrătorilor${until(item.expiresAt)}`);
  return (
    <>
      Un import din fișe așteaptă verificarea:{' '}
      <b className="font-medium">
        {toCheck === 1 ? 'o persoană' : countOf(toCheck, 'persoană', 'persoane')}
      </b>
      {endSentence(until(item.expiresAt))}
    </>
  );
}

function runningText(item: ImportListResponseItemsItem) {
  const progress = item.progress;
  if (!progress || progress.scans === 0) return 'Un import din fișe se citește.';
  return `Un import din fișe se citește: ${progress.scansRead} din ${countOf(progress.scans, 'fotografie', 'fotografii')} citite.`;
}

function OpenImportLine({
  clientId,
  item,
}: {
  clientId: string;
  item: ImportListResponseItemsItem;
}) {
  const ready = item.status === 'ready';
  const failed = item.status === 'failed';
  let text: ReactNode;
  let icon = <LoaderCircle className="animate-spin" />;
  if (ready) {
    text = readyText(item);
    icon = <FileCheck2 />;
  } else if (failed) {
    text = item.failureReason
      ? `Un import din fișe s-a oprit: ${endSentence(item.failureReason)}`
      : 'Un import din fișe s-a oprit din cauza unei erori.';
    icon = <CircleAlert />;
  } else if (item.status === 'uploading') {
    text = isUploadUnderway(item)
      ? 'Un import din fișe se încarcă.'
      : 'Un import din fișe nu s-a încărcat până la capăt, așa că citirea n-a pornit.';
    icon = <Upload />;
  } else {
    text = runningText(item);
  }
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 text-sm max-sm:flex-wrap max-sm:items-start max-sm:py-3 sm:px-6',
        ready ? 'bg-warning/50' : failed ? 'bg-destructive-soft/50' : 'bg-muted/50'
      )}
      data-testid="employee-import-line"
      data-status={item.status}
    >
      <span
        aria-hidden="true"
        className={cn(
          'shrink-0 max-sm:mt-0.5 [&_svg]:size-4',
          ready
            ? 'text-warning-foreground'
            : failed
              ? 'text-destructive-foreground'
              : 'text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <p className="min-w-0 flex-1" data-testid="employee-import-line-text">
        {text}
      </p>
      <Button asChild size="sm" variant="secondary" className="max-sm:h-11 max-sm:w-full">
        <Link
          to="/clienti/$clientId/angajati/import/$importId"
          state={openedFromRecord(`/clienti/${clientId}/angajati`)}
          params={{ clientId, importId: item.id }}
          data-testid="employee-import-open"
        >
          {ready ? 'Continuă importul' : 'Vezi importul'}
        </Link>
      </Button>
    </div>
  );
}

export function EmployeesImportedCard({ clientId }: { clientId: string }) {
  const { request, ready, key } = useApi();
  const params = { clientId, kind: 'employees' as const, status: 'confirmed' as const };
  const confirmed = useListImports(params, {
    request,
    query: {
      queryKey: key(getListImportsQueryKey(params)),
      enabled: ready,
    },
  });
  // Read in the initializer and dropped in an effect: development mode calls an initializer
  // twice, and a read that also deleted would leave the second call with nothing.
  const [notice] = useState(() => readEmployeesImported(clientId));
  useEffect(() => forgetEmployeesImported(clientId), [clientId]);
  const [hidden, setHidden] = useState<string[]>([]);
  const items = confirmed.data?.items ?? [];
  const visible = (item: ImportListResponseItemsItem) =>
    !hidden.includes(item.id) && !wasHiddenHere(item.id);
  const shown =
    items.find((item) => item.id === notice?.importId && visible(item)) ??
    items.find((item) => (item.uninvited ?? 0) > 0 && visible(item));
  if (!shown) return null;
  return (
    <ImportedNoticeCard
      key={shown.id}
      clientId={clientId}
      item={shown}
      notice={notice?.importId === shown.id ? notice : null}
      onHide={() => {
        hideHere(shown.id);
        setHidden((current) => [...current, shown.id]);
      }}
    />
  );
}

function ImportedNoticeCard({
  clientId,
  item,
  notice,
  onHide,
}: {
  clientId: string;
  item: ImportListResponseItemsItem;
  notice: EmployeesImported | null;
  onHide: () => void;
}) {
  const { openBulkInvite, bulkInviteDialog } = useBulkInvite(clientId);
  const invitees = useImportInvitees(clientId, item.id);
  const items = invitees.data?.items;
  const uninvited = uninvitedOf(items ?? []);
  if (!notice && uninvited === 0) return null;
  const noContact =
    notice?.noContact ??
    (items ?? []).filter(
      (invitee) => invitee.current && !invitee.portal && !invitee.email && !invitee.phone
    ).length;
  const allWithoutContact = noContact === (notice ? notice.created : uninvited);
  return (
    <Card
      className="grid gap-4 px-5 py-4"
      data-testid="employees-imported"
      aria-labelledby="employees-imported-title"
    >
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
        <span className="grid size-10 place-items-center rounded-lg bg-success text-success-foreground">
          <FileCheck2 className="size-5" aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <h3 id="employees-imported-title" className="font-semibold">
            {notice
              ? notice.created === 1
                ? 'Un lucrător creat din fișe'
                : `${countOf(notice.created, 'lucrător creat', 'lucrători creați')} din fișe`
              : `Lucrători importați din fișe pe ${shortDayMonthFormat.format(new Date(item.confirmedAt ?? item.createdAt))}`}
          </h3>
          <p className="text-sm text-muted-foreground">
            {notice
              ? importedSentence(notice)
              : uninvited === 1
                ? 'Un lucrător adus de import nu e încă invitat în portal.'
                : `${countOf(uninvited, 'lucrător', 'lucrători')} aduși de import nu sunt încă invitați în portal.`}
          </p>
        </div>
        <Button variant="ghost" size="sm" data-testid="employees-imported-hide" onClick={onHide}>
          Ascunde
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-muted/50 px-4 py-3 text-sm">
        <div className="grid min-w-0 flex-1 basis-80 gap-1.5">
          <p className="font-medium">Ce urmează: invită-i în portal</p>
          <p className="text-muted-foreground">
            Acolo semnează actul adițional privind semnarea electronică, apoi, de acum înainte,
            instruirile pe telefon. Ce e pe fișe rămâne semnat pe hârtie.
          </p>
          <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
            {noContact > 0 && (
              <li>
                {allWithoutContact
                  ? 'Fișele nu au email sau telefon: le scrii în dialogul de invitare.'
                  : `${countOf(noContact, 'lucrător nu are', 'lucrători nu au')} email sau telefon: le scrii în dialogul de invitare.`}
              </li>
            )}
            {notice && notice.noCommute.length > 0 && (
              <li>
                Mai lipsește traseul de deplasare la <Masked>{joinNames(notice.noCommute)}</Masked>.
              </li>
            )}
          </ul>
        </div>
        {uninvited > 0 && (
          <Button data-testid="employees-imported-invite" onClick={() => openBulkInvite(item.id)}>
            <Send aria-hidden="true" />
            Invită în portal lucrătorii din fișe
          </Button>
        )}
      </div>
      {bulkInviteDialog}
    </Card>
  );
}
