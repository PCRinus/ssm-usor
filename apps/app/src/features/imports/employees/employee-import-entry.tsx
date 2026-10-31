import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useRouteContext } from '@tanstack/react-router';
import {
  Camera,
  CircleAlert,
  FileCheck2,
  LoaderCircle,
  PenLine,
  Plus,
  ScanText,
  Send,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import {
  getListImportsQueryKey,
  type ImportListResponseItemsItem,
  useListImports,
} from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';
import { roCount } from '@/features/employees/employee-format';
import { useBulkInvite } from '@/features/participants/use-bulk-invite';
import { uninvitedOf, useImportInvitees } from '@/features/participants/use-import-invitees';

import { AbandonImportDialog } from '../abandon-import-dialog';
import { isRunning, isUploadUnderway, photosLabel } from '../import-format';
import {
  type EmployeesImported,
  forgetEmployeesImported,
  importedSentence,
  joinNames,
  readEmployeesImported,
} from './employees-imported-notice';
import { type FoundBatch, foundOn, useFoundSheets } from './found-sheets';
import { FoundStrip } from './found-strip';

export type StartImport = (way: 'found' | 'new') => void;

const dayMonth = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

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
  return (
    <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
      {count > 0 ? (
        <>
          <Button
            variant="outline"
            className="max-sm:h-auto max-sm:min-h-9 max-sm:py-2 max-sm:whitespace-normal"
            data-testid="employees-import-found"
            onClick={() => onStart('found')}
          >
            <ScanText aria-hidden="true" />
            Importă din fișele găsite în documentație ({photosLabel(count)})
          </Button>
          <Button variant="outline" data-testid="employees-import" onClick={() => onStart('new')}>
            <Camera aria-hidden="true" />
            Importă din fotografii noi
          </Button>
        </>
      ) : (
        <Button variant="outline" data-testid="employees-import" onClick={() => onStart('new')}>
          <Camera aria-hidden="true" />
          Importă din fișele de instruire
        </Button>
      )}
      <Button asChild>
        <Link
          to="/clients/$clientId/employees/new"
          params={{ clientId }}
          data-testid="employees-add"
        >
          <Plus aria-hidden="true" />
          Adaugă angajat
        </Link>
      </Button>
    </div>
  );
}

const wayClass =
  'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3.5 gap-y-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function WayBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="row-span-2 grid size-10 place-items-center rounded-lg bg-secondary"
      aria-hidden="true"
    >
      {children}
    </span>
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
  return (
    <div
      className="mx-auto mt-6 grid max-w-[40rem] gap-3 text-left"
      data-testid="employees-start-ways"
    >
      <Link to="/clients/$clientId/employees/new" params={{ clientId }} className={wayClass}>
        <WayBadge>
          <PenLine className="size-5" />
        </WayBadge>
        <span className="text-[15px] font-semibold">Adaugă primul angajat</span>
        <span className="text-sm leading-snug text-muted-foreground">
          Completezi tu datele persoanei, pornind de la nume și post.
        </span>
      </Link>
      {sheets.length > 0 && (
        <button
          type="button"
          className={wayClass}
          data-testid="employees-start-found"
          onClick={() => onStart('found')}
        >
          <WayBadge>
            <ScanText className="size-5" />
          </WayBadge>
          <span className="text-[15px] font-semibold">
            Importă din fișele găsite în documentație
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
        className={wayClass}
        data-testid="employees-start-import"
        onClick={() => onStart('new')}
      >
        <WayBadge>
          <Camera className="size-5" />
        </WayBadge>
        <span className="text-[15px] font-semibold">
          {sheets.length > 0 ? 'Importă din fotografii noi' : 'Importă din fișele de instruire'}
        </span>
        <span className="text-sm leading-snug text-muted-foreground">
          Fotografiezi fișele individuale pe hârtie, iar noi îți propunem angajații și instruirile
          lor.
        </span>
      </button>
    </div>
  );
}

export function OpenEmployeeImports({ clientId }: { clientId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const params = { clientId, kind: 'employees' as const };
  const imports = useListImports(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListImportsQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      refetchInterval: (query) =>
        query.state.data?.items.some((item) => isRunning(item.status) || isUploadUnderway(item))
          ? 5000
          : false,
    },
  });
  const items = imports.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="grid gap-3" data-testid="employee-imports">
      {items.map((item) => (
        <OpenImportCard key={item.id} clientId={clientId} item={item} />
      ))}
    </div>
  );
}

function OpenImportCard({
  clientId,
  item,
}: {
  clientId: string;
  item: ImportListResponseItemsItem;
}) {
  const [abandoning, setAbandoning] = useState(false);
  const running = isRunning(item.status);
  const people = item.people;
  let title: ReactNode = 'Import din fișe';
  let body: ReactNode = null;
  let action = 'Vezi importul';
  let icon = <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />;
  if (item.status === 'ready' && people) {
    icon = <FileCheck2 className="size-5" aria-hidden="true" />;
    action = 'Continuă';
    title = (
      <>
        Import din fișe:{' '}
        <span className="tabular-nums">
          {people.checked} din {people.total}
        </span>{' '}
        verificați
      </>
    );
    body = (
      <>
        <Progress
          value={people.total ? ((people.checked + people.setAside) / people.total) * 100 : 0}
          className="h-1.5 max-w-md"
          aria-label={`${people.checked} din ${roCount(people.total, 'persoană', 'persoane')} verificate`}
        />
        <p className="text-sm text-muted-foreground">
          Din {photosLabel(item.fileCount)}. Ce ai verificat e salvat; angajații se creează când
          confirmi, la final.
        </p>
      </>
    );
  } else if (item.status === 'failed') {
    icon = <CircleAlert className="size-5" aria-hidden="true" />;
    body = (
      <p className="text-sm text-muted-foreground">
        {item.failureReason ?? 'Importul s-a oprit din cauza unei erori.'}
      </p>
    );
  } else if (item.status === 'uploading') {
    body = (
      <p className="text-sm text-muted-foreground">
        {isUploadUnderway(item)
          ? 'Fotografiile se încarcă.'
          : 'Încărcarea nu s-a terminat, așa că citirea n-a pornit.'}
      </p>
    );
  } else if (running) {
    title = 'Import din fișe: citim fotografiile';
    body = (
      <p className="text-sm text-muted-foreground">
        Din {photosLabel(item.fileCount)}. Poți închide pagina: îl deschizi de aici când persoanele
        sunt gata de verificat.
      </p>
    );
  }
  return (
    <Card
      className="grid gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
      data-testid="employee-import-card"
      data-status={item.status}
      aria-labelledby={`employee-import-${item.id}`}
    >
      <span
        className={cn(
          'grid size-10 place-items-center rounded-lg',
          item.status === 'failed'
            ? 'bg-destructive-soft text-destructive-foreground'
            : 'bg-secondary'
        )}
      >
        {icon}
      </span>
      <div className="grid min-w-0 gap-2">
        <h3 id={`employee-import-${item.id}`} className="font-semibold">
          {title}
        </h3>
        {body}
        {item.expiresAt && (
          <p className="text-sm" data-testid="employee-import-expires">
            Se păstrează până pe {dayMonth.format(new Date(item.expiresAt))} dacă nu mai lucrezi la
            el.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="ghost" size="sm" onClick={() => setAbandoning(true)}>
          Renunță…
        </Button>
        <Button asChild size="sm" variant={item.status === 'ready' ? 'default' : 'outline'}>
          <Link
            to="/clients/$clientId/employees/import/$importId"
            params={{ clientId, importId: item.id }}
            data-testid="employee-import-open"
          >
            {action}
          </Link>
        </Button>
      </div>
      <AbandonImportDialog
        importId={abandoning ? item.id : null}
        running={running}
        employees
        onClose={() => setAbandoning(false)}
        onAbandoned={() => undefined}
      />
    </Card>
  );
}

export function EmployeesImportedCard({ clientId }: { clientId: string }) {
  // Read in the initializer and dropped in an effect: development mode calls an initializer
  // twice, and a read that also deleted would leave the second call with nothing.
  const [notice, setNotice] = useState(() => readEmployeesImported(clientId));
  useEffect(() => forgetEmployeesImported(clientId), [clientId]);
  if (!notice) return null;
  return <ImportedNoticeCard clientId={clientId} notice={notice} onHide={() => setNotice(null)} />;
}

function ImportedNoticeCard({
  clientId,
  notice,
  onHide,
}: {
  clientId: string;
  notice: EmployeesImported;
  onHide: () => void;
}) {
  const { openBulkInvite, bulkInviteDialog } = useBulkInvite(clientId);
  const invitees = useImportInvitees(clientId, notice.importId);
  const uninvited = uninvitedOf(invitees.data?.items ?? []);
  const created = notice.created;
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
            {created === 1
              ? 'Un angajat creat din fișe'
              : `${roCount(created, 'angajat creat', 'angajați creați')} din fișe`}
          </h3>
          <p className="text-sm text-muted-foreground">{importedSentence(notice)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onHide}>
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
            {notice.noContact > 0 && (
              <li>
                {notice.noContact === notice.created
                  ? 'Fișele nu au email sau telefon: le scrii în dialogul de invitare.'
                  : `${roCount(notice.noContact, 'angajat nu are', 'angajați nu au')} email sau telefon: le scrii în dialogul de invitare.`}
              </li>
            )}
            {notice.noCommute.length > 0 && (
              <li>Mai lipsește traseul de deplasare la {joinNames(notice.noCommute)}.</li>
            )}
          </ul>
        </div>
        {uninvited > 0 && (
          <Button
            data-testid="employees-imported-invite"
            onClick={() => openBulkInvite(notice.importId)}
          >
            <Send aria-hidden="true" />
            Invită în portal angajații din fișe
          </Button>
        )}
      </div>
      {bulkInviteDialog}
    </Card>
  );
}
