import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import {
  ArrowRight,
  Check,
  CircleCheck,
  Clock,
  FileText,
  Flame,
  HardHat,
  type LucideIcon,
  ShieldAlert,
  TimerOff,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

import type { ImportDetail, ImportLibraryPart } from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import { CreditsUsedLine } from '../credits-notices';
import { endSentence, usageLine } from '../import-format';
import { ReportImportButton } from '../report-import-button';
import { PartStatusTag } from './library-group';
import {
  isExpired,
  isInstructionsLibraryPart,
  isOpenPart,
  libraryDay,
  partDescription,
  partLabels,
  partOrder,
} from './library-model';
import { deadlineLine, earliestExpiry, foundSentence, takenSentence } from './next-steps-model';
import { isRisksLibraryPart, risksPartDescription } from './risks-model';
import { useLibraryParts } from './use-library-parts';

type Step = {
  part: ImportLibraryPart;
  label: string;
  verb: string;
  icon: LucideIcon;
  help: { topic: HelpTopic; label: string };
  link: LinkProps;
  description: string;
};

const instructionsHelp = {
  topic: 'import.instructiuni-proprii',
  label: 'Ajutor: Instrucțiuni proprii',
} as const;

const risksHelp = { topic: 'import.evaluari-de-risc', label: 'Ajutor: Evaluări de risc' } as const;

function stepOf(importId: string, part: ImportLibraryPart, now: number): Step {
  if (isRisksLibraryPart(part)) {
    return {
      part,
      label: 'Fișe de evaluare',
      verb: 'fișele',
      icon: ShieldAlert,
      help: risksHelp,
      link: { to: '/clienti/import/$importId/evaluari-de-risc', params: { importId } },
      description: risksPartDescription(part, true, now),
    };
  }
  return {
    part,
    label: partLabels[part.part],
    verb: partLabels[part.part],
    icon: part.domain === 'ssm' ? HardHat : Flame,
    help: instructionsHelp,
    link: {
      to: '/clienti/import/$importId/instructiuni/$domain',
      params: { importId, domain: part.domain },
    },
    description: partDescription(part, true, now),
  };
}

function orderedParts(parts: readonly ImportLibraryPart[]) {
  return [
    ...parts
      .filter(isInstructionsLibraryPart)
      .sort((a, b) => partOrder.indexOf(a.part) - partOrder.indexOf(b.part)),
    ...parts.filter(isRisksLibraryPart),
  ];
}

export function ConfirmedImportHub({ detail }: { detail: ImportDetail }) {
  const client = detail.client;
  const name = client?.legalName ?? detail.companyName ?? 'Clientul importat';
  const query = useLibraryParts(detail.id);
  const [now] = useState(() => Date.now());
  const steps = orderedParts(query.data?.parts ?? []).map((part) => stepOf(detail.id, part, now));
  const open = steps.filter((step) => isOpenPart(step.part, now));
  const confirmed = steps.filter((step) => step.part.status === 'confirmed');
  const expired = steps.filter((step) => isExpired(step.part, now));
  const finished = query.isSuccess && open.length === 0;

  return (
    <div data-testid="import-confirmed-hub" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-3xl gap-1">
          <span className="text-sm text-muted-foreground">
            {detail.intoExistingClient
              ? 'Client completat din documente'
              : 'Client creat din documente'}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/clienti/import/$importId/fisiere"
              params={{ importId: detail.id }}
              data-testid="import-review-files"
            >
              <FileText aria-hidden="true" />
              Fișierele importului
            </Link>
          </Button>
          <ReportImportButton importId={detail.id} />
        </div>
      </div>
      {query.isPending ? (
        <Skeleton className="h-48 rounded-2xl" aria-busy="true" />
      ) : query.isError ? (
        <Notice variant="destructive" data-testid="import-library-error">
          Nu am putut încărca instrucțiunile proprii și evaluările de risc din import. Reîncarcă
          pagina.
        </Notice>
      ) : finished ? (
        <FinishedPanel detail={detail} confirmed={confirmed} />
      ) : (
        <NextSteps open={open} now={now} />
      )}
      {(client || confirmed.length > 0) && (
        <DoneList
          detail={detail}
          title={finished ? 'Ce am preluat' : 'Gata'}
          confirmed={confirmed}
          openClient={!finished}
        />
      )}
      {expired.length > 0 && <ExpiredList expired={expired} />}
      <div className="grid gap-1 text-sm">
        <CreditsUsedLine detail={detail} kind="client" />
        {detail.usage && (
          <p className="text-xs text-muted-foreground tabular-nums" data-testid="import-usage">
            {usageLine(detail.usage)}
          </p>
        )}
      </div>
    </div>
  );
}

function StepTitle({ step, className }: { step: Step; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1', className)}>
      {step.label}
      <HelpLink topic={step.help.topic} label={step.help.label} />
    </span>
  );
}

function NextSteps({ open, now }: { open: Step[]; now: number }) {
  const until = earliestExpiry(open.map((step) => step.part));
  const found = foundSentence(open.map((step) => step.part));
  return (
    <section
      aria-labelledby="import-next-steps-heading"
      data-testid="import-next-steps"
      className="grid gap-3.5 rounded-2xl border border-dashboard-panel-border bg-dashboard-panel p-4 sm:p-5"
    >
      <div className="grid gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="import-next-steps-heading" className="text-lg font-semibold">
            Ce mai ai de făcut
          </h2>
          {until && (
            <span
              className="inline-flex items-center gap-1.5 font-medium tabular-nums"
              data-testid="import-next-steps-deadline"
            >
              <Clock className="size-4 shrink-0 self-center" aria-hidden="true" />
              {deadlineLine(until, now)}
            </span>
          )}
        </div>
        <p className="max-w-[72ch]">
          {found && <span className="max-sm:hidden">{found} </span>}
          Le verifici și le confirmi ca să intre în biblioteca ta și la posturile clientului; ce nu
          confirmi până atunci nu se mai adaugă.
        </p>
      </div>
      <ul className="grid gap-2">
        {open.map((step, index) => (
          <li
            key={step.part.part}
            data-testid="import-next-step"
            data-part={step.part.part}
            className="grid gap-x-3.5 gap-y-1 rounded-xl border border-dashboard-tile-border bg-card p-3.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-4"
          >
            <span
              className="grid size-10 place-items-center rounded-lg bg-secondary max-sm:hidden"
              aria-hidden="true"
            >
              <step.icon className="size-5" />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <StepTitle step={step} className="font-semibold" />
                {(step.part.status === 'reading' || step.part.status === 'failed') && (
                  <PartStatusTag part={step.part} />
                )}
              </span>
              <span
                className="text-sm text-muted-foreground"
                data-testid="import-next-step-description"
              >
                {step.description}
              </span>
            </span>
            <Button asChild variant={index === 0 ? 'default' : 'outline'} className="max-sm:mt-2">
              <Link {...step.link} data-testid="import-next-step-open">
                {step.part.status === 'reading' || step.part.status === 'failed'
                  ? `Vezi ${step.verb}`
                  : `Verifică ${step.verb}`}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinishedPanel({ detail, confirmed }: { detail: ImportDetail; confirmed: Step[] }) {
  return (
    <section
      aria-labelledby="import-finished-heading"
      data-testid="import-finished"
      className="grid gap-x-4 gap-y-3 rounded-xl border border-success-border bg-success p-4 text-success-foreground sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-5"
    >
      <span
        className="grid size-10 place-items-center rounded-lg bg-card/60 max-sm:hidden"
        aria-hidden="true"
      >
        <CircleCheck className="size-5" />
      </span>
      <div className="grid gap-0.5">
        <h2 id="import-finished-heading" className="text-base font-semibold">
          Importul e încheiat.
        </h2>
        <p className="text-foreground">{takenSentence(confirmed.map((step) => step.part))}</p>
      </div>
      {detail.client && (
        <Button asChild className="w-fit">
          <Link
            to="/clienti/$clientId/detalii"
            params={{ clientId: detail.client.id }}
            data-testid="import-open-client"
          >
            Deschide clientul
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </section>
  );
}

const rowClass =
  'grid min-h-14 grid-cols-[1.375rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 @2xl:grid-cols-[1.5rem_12.5rem_minmax(0,1fr)_auto] @2xl:gap-x-3.5 @2xl:px-5';

function RowMark({ expired = false }: { expired?: boolean }) {
  return (
    <span
      className={cn(
        'grid size-[1.375rem] place-items-center self-start rounded-full border @2xl:self-center',
        expired
          ? 'border-border bg-secondary text-secondary-foreground'
          : 'border-success-border bg-success text-success-foreground'
      )}
      aria-hidden="true"
    >
      {expired ? (
        <TimerOff className="size-3" strokeWidth={2.5} />
      ) : (
        <Check className="size-3" strokeWidth={3} />
      )}
    </span>
  );
}

function RowText({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="col-start-2 font-medium @2xl:col-start-auto">{title}</span>
      <span className="col-start-2 row-start-2 text-sm text-muted-foreground @2xl:col-start-auto @2xl:row-start-auto">
        {children}
      </span>
    </>
  );
}

function SeeLink({ step, testId }: { step: Step; testId: string }) {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="col-start-3 row-span-2 row-start-1 @2xl:col-start-auto @2xl:row-span-1 @2xl:row-start-auto"
    >
      <Link {...step.link} data-testid={testId} aria-label={`Vezi ${step.label}`}>
        Vezi
      </Link>
    </Button>
  );
}

function DoneList({
  detail,
  title,
  confirmed,
  openClient,
}: {
  detail: ImportDetail;
  title: string;
  confirmed: Step[];
  openClient: boolean;
}) {
  const client = detail.client;
  const on = detail.confirmedAt ? ` pe ${libraryDay(detail.confirmedAt)}` : '';
  return (
    <section aria-labelledby="import-done-heading" className="grid gap-2.5">
      <h2 id="import-done-heading" className="text-base font-semibold">
        {title}
      </h2>
      <ul
        className="@container divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
        data-testid="import-done"
      >
        {client && (
          <li className={rowClass} data-testid="import-done-client">
            <RowMark />
            <RowText title="Datele clientului">
              Preluate în {endSentence(`${client.legalName}${on}`)}
            </RowText>
            {openClient ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="col-span-full mt-2 @2xl:col-span-1 @2xl:mt-0"
              >
                <Link
                  to="/clienti/$clientId/detalii"
                  params={{ clientId: client.id }}
                  data-testid="import-open-client"
                >
                  Deschide clientul
                </Link>
              </Button>
            ) : null}
          </li>
        )}
        {confirmed.map((step) => (
          <li
            key={step.part.part}
            className={rowClass}
            data-testid="import-done-part"
            data-part={step.part.part}
          >
            <RowMark />
            <RowText title={<StepTitle step={step} />}>{step.description}</RowText>
            <SeeLink step={step} testId="import-done-part-open" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExpiredList({ expired }: { expired: Step[] }) {
  return (
    <section aria-labelledby="import-expired-heading" className="grid gap-2.5">
      <h2 id="import-expired-heading" className="text-base font-semibold">
        Au expirat
      </h2>
      <ul
        className="@container divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
        data-testid="import-expired"
      >
        {expired.map((step) => (
          <li
            key={step.part.part}
            className={rowClass}
            data-testid="import-expired-part"
            data-part={step.part.part}
          >
            <RowMark expired />
            <RowText title={<StepTitle step={step} />}>{step.description}</RowText>
            <SeeLink step={step} testId="import-expired-part-open" />
          </li>
        ))}
      </ul>
    </section>
  );
}
