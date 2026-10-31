import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Link, useNavigate } from '@tanstack/react-router';
import { BriefcaseBusiness } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { AbandonImportDialog } from '../abandon-import-dialog';
import { EmployeeConfirmDialog } from './employee-confirm-dialog';
import { nextToCheck, peopleCounts, peopleViews } from './employee-review-model';
import { PeopleList } from './people-list';
import { peopleLabel, sheetFilesLabel } from './review-format';
import { TitleGroups, WorkplaceGroups } from './review-groups';
import { SaveStatus } from './save-status';
import { UnplacedPages } from './unplaced-pages';
import { useReviewContext } from './use-review-context';

const dayMonth = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

export function EmployeeHub({
  detail,
  clientId,
  clientName,
}: {
  detail: ImportDetail;
  clientId: string;
  clientName: string;
}) {
  const navigate = useNavigate();
  const { review, context, positions, workplaces } = useReviewContext(detail, clientId);
  const [abandoning, setAbandoning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const views = useMemo(() => peopleViews(context), [context]);
  const counts = peopleCounts(context);
  const next = nextToCheck(context);
  const nextView = next && views.find((view) => view.person.id === next.id);
  const fileIds = new Set(context.proposal.pages.map((page) => page.fileId));
  const files = detail.files.filter((file) => fileIds.has(file.id));

  return (
    <div className="grid gap-6" data-testid="employee-hub">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-3xl gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Verifică angajații propuși</h1>
          <p className="text-sm text-muted-foreground">
            Pentru {clientName}: {peopleLabel(counts.total)} din {sheetFilesLabel(files)}. Nu creăm
            pe nimeni până nu confirmi, o singură dată, la final.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAbandoning(true)}>
          Renunță la import
        </Button>
      </div>
      <SaveStatus review={review} />
      <Card
        className="grid gap-x-8 gap-y-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
        data-testid="employee-hub-progress"
      >
        <div className="grid gap-2">
          <h2 className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {counts.checked} din {counts.total}
            </span>
            <span className="text-muted-foreground">verificați</span>
          </h2>
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${counts.checked} verificați, ${counts.toCheck} de verificat, ${counts.setAside} lăsați deoparte`}
          >
            <span
              className="bg-primary"
              style={{ width: `${(counts.checked / Math.max(1, counts.total)) * 100}%` }}
            />
            <span
              className="bg-muted-foreground/40"
              style={{ width: `${(counts.setAside / Math.max(1, counts.total)) * 100}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {counts.toCheck} de verificat · {counts.setAside}{' '}
            {counts.setAside === 1 ? 'lăsat deoparte' : 'lăsați deoparte'}
          </p>
        </div>
        <div className="grid gap-1 text-sm">
          <p>
            Ce verifici se salvează pe loc. Poți închide pagina și continua mai târziu, din fila
            Angajați a clientului.
          </p>
          {detail.expiresAt && (
            <p className="text-muted-foreground">
              Se păstrează până pe {dayMonth.format(new Date(detail.expiresAt))} dacă nu mai lucrezi
              la el.
            </p>
          )}
        </div>
        {nextView ? (
          <Button asChild data-testid="employee-hub-continue">
            <Link
              to="/clients/$clientId/employees/import/$importId/$personId"
              params={{ clientId, importId: detail.id, personId: nextView.person.id }}
            >
              Continuă cu {nextView.name}
            </Link>
          </Button>
        ) : (
          <Button data-testid="employee-hub-continue" onClick={() => setConfirming(true)}>
            Creează angajații
          </Button>
        )}
      </Card>
      {!context.proposal.clientHasPositions && positions.length === 0 && (
        <Notice
          variant="warning"
          icon={<BriefcaseBusiness aria-hidden="true" />}
          title="Clientul nu are încă posturi de lucru"
        >
          Fiecare angajat intră pe un post al clientului. Adaugă posturile de mai jos, câte unul
          pentru fiecare post scris pe fișe; le completezi apoi pe pagina postului.
        </Notice>
      )}
      <TitleGroups
        context={context}
        positions={positions}
        clientId={clientId}
        onChange={review.update}
      />
      <WorkplaceGroups context={context} workplaces={workplaces} onChange={review.update} />
      <PeopleList
        detail={detail}
        clientId={clientId}
        context={context}
        views={views}
        positions={positions}
      />
      <UnplacedPages detail={detail} context={context} onChange={review.update} />
      <Card
        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
        aria-label="Crearea angajaților"
      >
        <p className="max-w-2xl text-sm">
          Creezi angajații o singură dată, când ai terminat.{' '}
          <span className="text-muted-foreground">
            Poți și înainte să-i verifici pe toți: cei neverificați rămân în afara acestui import.
          </span>
        </p>
        <Button
          variant={counts.toCheck === 0 ? 'default' : 'outline'}
          data-testid="employee-hub-confirm"
          disabled={counts.checked === 0}
          onClick={() => setConfirming(true)}
        >
          Creează angajații…
        </Button>
      </Card>
      <EmployeeConfirmDialog
        open={confirming}
        detail={detail}
        clientId={clientId}
        clientName={clientName}
        context={context}
        review={review}
        onClose={() => setConfirming(false)}
      />
      <AbandonImportDialog
        importId={abandoning ? detail.id : null}
        running={false}
        employees
        onClose={() => setAbandoning(false)}
        onAbandoned={() =>
          void navigate({ to: '/clients/$clientId/employees', params: { clientId } })
        }
      />
    </div>
  );
}
