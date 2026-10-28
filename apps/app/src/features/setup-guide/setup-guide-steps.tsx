import type { SetupStepId } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ssm-usor/ui/components/tooltip';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Check, ChevronDown, ChevronUp, Hourglass, Lock } from 'lucide-react';
import { useId, useState } from 'react';

import type { SetupGuide, SetupStep } from '@/api/generated/api';

import { useSetupGuide } from './setup-guide-context';
import {
  countsAsDone,
  doneNote,
  fieldLabels,
  fieldTarget,
  groupTitle,
  isMemberStep,
  lockReason,
  missingSentence,
  ownerOnlyNote,
  type StepContext,
  stepCopy,
  type StepGroup,
  stepGroups,
  stepLabel,
} from './steps';

function Tick({ light = false }: { light?: boolean }) {
  return light ? (
    <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-primary">
      <Check aria-hidden="true" className="size-[11px] stroke-3" />
    </span>
  ) : (
    <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary">
      <Check aria-hidden="true" className="size-3 stroke-3 text-accent" />
    </span>
  );
}

const rowClass = (phone: boolean) =>
  cn(
    'flex w-full items-start gap-2.5 rounded-lg px-2 py-[7px] text-left text-[13.5px] leading-[19px] text-foreground',
    phone && 'min-h-11 items-center py-2 text-sm'
  );

const linkRowClass = (phone: boolean) =>
  cn(
    rowClass(phone),
    'outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50'
  );

function TwoLines({ label, note }: { label: string; note: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </span>
  );
}

interface RowProps {
  step: SetupStep;
  label: string;
  context: StepContext;
}

function NextCard({ step, label, context }: RowProps) {
  const { phone, skip, follow, pendingStep } = useSetupGuide();
  const copy = stepCopy[step.id];
  const missing = context.missing;
  const skippable = isMemberStep(step.id) ? step.id : null;
  return (
    <div
      data-testid={`setup-step-${step.id}`}
      data-state="next"
      className="my-0.5 mb-1 flex gap-2.5 rounded-[10px] border border-dashboard-panel-border bg-card px-2.5 pt-2.5 pb-3"
    >
      <span className="mt-px size-[18px] shrink-0 rounded-full border-2 border-primary" />
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <span className={cn('text-[13.5px] leading-[19px] font-semibold', phone && 'text-sm')}>
          {label}
        </span>
        <span
          className={cn(
            'text-[12.5px] leading-[18px] text-dashboard-quiet',
            phone && 'text-[13px] leading-[19px]'
          )}
        >
          {copy.sentence}
        </span>
        {missing.length > 0 && (
          <span
            data-testid="setup-step-missing"
            className="text-[12.5px] leading-[18px] text-dashboard-quiet"
          >
            {missingSentence(missing)}{' '}
            {missing.map((field, index) => (
              <span key={field}>
                {index > 0 && ', '}
                <Link
                  {...fieldTarget(field)}
                  data-testid={`setup-step-field-${field}`}
                  onClick={() => follow(step.id, 'open')}
                  className={cn(
                    'font-medium underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    phone && 'inline-flex min-h-11 items-center'
                  )}
                >
                  {fieldLabels[field]}
                </Link>
              </span>
            ))}
          </span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          {copy.actions(context).map((action, index) => (
            <Button
              key={action.label}
              asChild
              size={phone ? 'lg' : 'sm'}
              variant={index === 0 ? 'default' : 'outline'}
              className={cn('font-semibold', phone && 'h-11 px-4')}
            >
              <Link
                {...action.target}
                data-testid={`setup-step-action-${index}`}
                onClick={() => follow(step.id, action.kind)}
              >
                {action.label}
              </Link>
            </Button>
          ))}
          {skippable && (
            <button
              type="button"
              data-testid="setup-step-skip"
              disabled={pendingStep === skippable}
              onClick={() => skip(skippable)}
              className={cn(
                'rounded-sm px-0.5 py-1 text-[12.5px] text-dashboard-quiet underline outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
                phone && 'min-h-11 px-1 text-[13.5px]'
              )}
            >
              Știu deja
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function LockedRow({ step, label, reason }: { step: SetupStep; label: string; reason: string }) {
  const { phone } = useSetupGuide();
  if (phone) {
    return (
      <div
        data-testid={`setup-step-${step.id}`}
        data-state="locked"
        className={cn(rowClass(phone), 'text-muted-foreground')}
      >
        <Lock aria-hidden="true" className="mt-px size-[18px] shrink-0 text-dashboard-chevron" />
        <TwoLines label={label} note={reason} />
      </div>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          data-testid={`setup-step-${step.id}`}
          data-state="locked"
          className={cn(
            rowClass(phone),
            'cursor-default text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
          )}
        >
          <Lock aria-hidden="true" className="mt-px size-[18px] shrink-0 text-dashboard-chevron" />
          <span>{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={4}
        data-testid="setup-step-lock-reason"
        className="max-w-[220px] text-left"
      >
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}

function StepRow({
  step,
  guide,
  neutral,
}: {
  step: SetupStep;
  guide: SetupGuide;
  neutral: boolean;
}) {
  const { phone, isOwner, follow, unskip, pendingStep } = useSetupGuide();
  const label = stepLabel(step.id, neutral);
  const context: StepContext = { clientId: guide.clientId, missing: step.missing ?? [] };
  const target = stepCopy[step.id].actions(context)[0]?.target;
  const { ownerName } = guide;

  if (step.id === guide.next) return <NextCard step={step} label={label} context={context} />;

  if (step.state === 'done') {
    const body = (
      <>
        <Tick />
        <TwoLines label={label} note={doneNote(step.id, { ownerName, canDo: step.canDo })} />
      </>
    );
    return target && step.canDo ? (
      <Link
        {...target}
        data-testid={`setup-step-${step.id}`}
        data-state="done"
        onClick={() => follow(step.id, 'open')}
        className={linkRowClass(phone)}
      >
        {body}
      </Link>
    ) : (
      <div data-testid={`setup-step-${step.id}`} data-state="done" className={rowClass(phone)}>
        {body}
      </div>
    );
  }

  const skipped = step.state === 'skipped' && isMemberStep(step.id) ? step.id : null;
  if (skipped) {
    return (
      <div
        data-testid={`setup-step-${step.id}`}
        data-state="skipped"
        className="flex items-center gap-1"
      >
        {target ? (
          <Link
            {...target}
            onClick={() => follow(step.id, 'open')}
            className={cn(linkRowClass(phone), 'min-w-0 flex-1')}
          >
            <Tick light />
            <TwoLines label={label} note="Știi deja" />
          </Link>
        ) : (
          <span className={cn(rowClass(phone), 'min-w-0 flex-1')}>
            <Tick light />
            <TwoLines label={label} note="Știi deja" />
          </span>
        )}
        <button
          type="button"
          data-testid="setup-step-unskip"
          aria-label={`Anulează «Știi deja» la ${label}`}
          disabled={pendingStep === skipped}
          onClick={() => unskip(skipped)}
          className={cn(
            'shrink-0 rounded-sm px-1.5 py-1 text-xs text-muted-foreground underline outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
            phone && 'min-h-11 px-2 text-[13px]'
          )}
        >
          Anulează
        </button>
      </div>
    );
  }

  if (!step.canDo) {
    return (
      <div
        data-testid={`setup-step-${step.id}`}
        data-state="owner-only"
        className={cn(rowClass(phone), 'text-dashboard-quiet')}
      >
        <Hourglass
          aria-hidden="true"
          className="mt-px size-[18px] shrink-0 text-dashboard-chevron"
        />
        <TwoLines label={label} note={ownerOnlyNote(ownerName)} />
      </div>
    );
  }

  if (step.state === 'locked' && step.lock) {
    return (
      <LockedRow step={step} label={label} reason={lockReason(step.lock, { ownerName, isOwner })} />
    );
  }

  return target ? (
    <Link
      {...target}
      data-testid={`setup-step-${step.id}`}
      data-state="open"
      onClick={() => follow(step.id, 'open')}
      className={linkRowClass(phone)}
    >
      <span className="mt-px size-[18px] shrink-0 rounded-full border-[1.5px] border-dashboard-chevron" />
      <span>{label}</span>
    </Link>
  ) : null;
}

const groupOf = (id: SetupStepId | null) =>
  id ? stepGroups.find((group) => group.steps.includes(id)) : undefined;

function GroupSection({
  group,
  guide,
  open,
  onToggle,
}: {
  group: StepGroup;
  guide: SetupGuide;
  open: boolean;
  onToggle: () => void;
}) {
  const { phone } = useSetupGuide();
  const id = useId();
  const steps = group.steps.map((stepId) => guide.steps.find((step) => step.id === stepId)!);
  const done = steps.filter(countsAsDone).length;
  const complete = done === steps.length;
  const neutral = guide.organizationHasClients;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <div
      data-testid={`setup-guide-group-${group.id}`}
      data-open={open}
      className={cn('rounded-xl', open && 'bg-dashboard-hover')}
    >
      <button
        type="button"
        data-testid="setup-guide-group-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-3 text-left outline-none hover:bg-dashboard-hover focus-visible:ring-[3px] focus-visible:ring-ring/50',
          phone && 'min-h-12'
        )}
      >
        {complete && <Tick />}
        <span className={cn('grow text-sm font-semibold', phone && 'text-[15px]')}>
          {groupTitle(group, neutral)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {complete ? 'Gata' : `${done} din ${steps.length}`}
        </span>
        <Chevron aria-hidden="true" className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-0.5 px-2 pb-2.5">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} guide={guide} neutral={neutral} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SetupGuideSteps({ guide }: { guide: SetupGuide }) {
  const firstOpen = groupOf(guide.next)?.id ?? null;
  const [open, setOpen] = useState<StepGroup['id'] | null>(firstOpen);
  const [followed, setFollowed] = useState(firstOpen);
  if (firstOpen !== followed) {
    setFollowed(firstOpen);
    if (firstOpen) setOpen(firstOpen);
  }
  return (
    <div className="flex flex-col gap-1">
      {stepGroups.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          guide={guide}
          open={open === group.id}
          onToggle={() => setOpen(open === group.id ? null : group.id)}
        />
      ))}
    </div>
  );
}
