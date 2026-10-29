import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { type ReactNode, useId, useRef } from 'react';

import type { SetupGuide } from '@/api/generated/api';

import { useSetupGuide } from './setup-guide-context';
import { SetupGuideSteps } from './setup-guide-steps';
import { stepCopy, stepLabel, totalSteps } from './steps';
import { useGuideFocus } from './use-guide-focus';

const title = 'Ghid de configurare';

const iconButton = (phone: boolean) =>
  cn(
    'flex shrink-0 cursor-pointer items-center justify-center rounded-lg text-dashboard-quiet outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
    phone ? 'size-11' : 'size-8'
  );

function Bar({ doneCount, className }: { doneCount: number; className?: string }) {
  return (
    <Progress
      data-testid="setup-guide-bar"
      aria-label="Pașii făcuți"
      value={Math.round((doneCount / totalSteps) * 100)}
      getValueLabel={() => `${doneCount} din ${totalSteps}`}
      className={cn('h-1.5 bg-muted', className)}
      indicatorClassName="rounded-full"
    />
  );
}

function Count({ doneCount, phone }: { doneCount: number; phone: boolean }) {
  return (
    <span
      data-testid="setup-guide-count"
      className={cn(
        'mr-1 text-[12.5px] text-muted-foreground tabular-nums',
        phone && 'text-[13px]'
      )}
    >
      {doneCount} din {totalSteps}
    </span>
  );
}

function Controls({ expanded }: { expanded: boolean }) {
  const { phone, expand, collapse, close } = useSetupGuide();
  const Chevron = expanded ? ChevronDown : ChevronUp;
  const label = expanded ? 'Micșorează ghidul' : 'Arată toți pașii';
  const toggle = useRef<HTMLButtonElement>(null);
  useGuideFocus(expanded ? 'collapse' : 'expand', toggle);
  return (
    <>
      <button
        ref={toggle}
        type="button"
        data-testid={expanded ? 'setup-guide-collapse' : 'setup-guide-expand'}
        aria-label={label}
        title={label}
        onClick={expanded ? collapse : expand}
        className={iconButton(phone)}
      >
        <Chevron aria-hidden="true" className={phone ? 'size-[18px]' : 'size-4'} />
      </button>
      <button
        type="button"
        data-testid="setup-guide-close"
        aria-label="Ascunde ghidul"
        title="Ascunde ghidul (îl redeschizi din antet)"
        onClick={close}
        className={iconButton(phone)}
      >
        <X aria-hidden="true" className={phone ? 'size-[18px]' : 'size-4'} />
      </button>
    </>
  );
}

function FinishedLine() {
  return (
    <p
      data-testid="setup-guide-finished"
      className="rounded-lg bg-dashboard-panel px-3 py-2 text-[13.5px] font-medium"
    >
      Gata, ai trecut prin toți pașii.
    </p>
  );
}

function NextLine({ guide, phone }: { guide: SetupGuide; phone: boolean }) {
  const { follow, complete } = useSetupGuide();
  if (complete) return <FinishedLine />;
  const next = guide.steps.find((step) => step.id === guide.next);
  if (!next) {
    // A step the member skipped can lock the one after it too; that wait is not an owner's.
    const waitsForOwner = guide.steps.some(
      (step) => step.state === 'locked' && step.lock === 'needs-organization-data'
    );
    return waitsForOwner ? (
      <p
        data-testid="setup-guide-waiting"
        className={cn('m-0 text-[13.5px] text-dashboard-quiet', phone && 'mr-3 text-sm')}
      >
        Așteaptă administratorul
      </p>
    ) : null;
  }
  const action = stepCopy[next.id].actions({
    clientId: guide.clientId,
    missing: next.missing ?? [],
  })[0];
  const label = stepLabel(next.id, guide.organizationHasClients);
  return (
    <p className={cn('m-0 text-[13.5px] text-dashboard-quiet', phone && 'mr-3 text-sm')}>
      Următorul:{' '}
      {action ? (
        <Link
          {...action.target}
          data-testid="setup-guide-next"
          onClick={() => follow(next.id, action.kind)}
          className={cn(
            'font-semibold text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50',
            phone && 'inline-flex min-h-11 items-center'
          )}
        >
          {label}
        </Link>
      ) : (
        <span className="font-semibold text-foreground">{label}</span>
      )}
    </p>
  );
}

function Heading({ id }: { id: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useGuideFocus('heading', heading);
  return (
    <h2
      ref={heading}
      id={id}
      tabIndex={-1}
      className="m-0 grow text-[15px] font-semibold outline-none"
    >
      {title}
    </h2>
  );
}

function DesktopWindow({ guide, expanded }: { guide: SetupGuide; expanded: boolean }) {
  const { doneCount, collapse, complete } = useSetupGuide();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-testid="setup-guide"
      data-view={expanded ? 'expanded' : 'collapsed'}
      onKeyDown={(event) => {
        // A lock's tooltip closes on the same Esc, and marks it handled.
        if (event.key !== 'Escape' || !expanded || event.defaultPrevented) return;
        event.preventDefault();
        collapse();
      }}
      className={cn(
        'fixed right-6 bottom-6 z-40 flex flex-col overflow-hidden border bg-card text-foreground',
        expanded
          ? 'max-h-[min(760px,calc(100svh-7rem))] w-[372px] rounded-2xl shadow-[0_18px_44px_rgb(24_52_46/0.18)]'
          : 'w-[340px] gap-2.5 rounded-[14px] py-3.5 pr-3.5 pl-4 shadow-[0_14px_36px_rgb(24_52_46/0.16)]'
      )}
    >
      {expanded ? (
        <>
          <div className="flex flex-col gap-2.5 border-b border-muted pt-3.5 pr-3.5 pb-3 pl-[18px]">
            <div className="flex items-center gap-1.5">
              <Heading id={titleId} />
              <Count doneCount={doneCount} phone={false} />
              <Controls expanded />
            </div>
            <Bar doneCount={doneCount} />
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto p-2">
            {complete && <FinishedLine />}
            <SetupGuideSteps guide={guide} />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <Heading id={titleId} />
            <Count doneCount={doneCount} phone={false} />
            <Controls expanded={false} />
          </div>
          <Bar doneCount={doneCount} />
          <NextLine guide={guide} phone={false} />
        </>
      )}
    </section>
  );
}

function PhoneBar({ guide }: { guide: SetupGuide }) {
  const { doneCount, expand } = useSetupGuide();
  const titleId = useId();
  return (
    <>
      <div aria-hidden="true" className="h-32 shrink-0" />
      <section
        aria-labelledby={titleId}
        data-testid="setup-guide"
        data-view="collapsed"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 flex flex-col gap-1.5 rounded-2xl border bg-card pt-1 pr-1 pb-3 pl-4 text-foreground shadow-[0_12px_30px_rgb(24_52_46/0.18)]"
      >
        <div className="flex items-center">
          <button
            type="button"
            onClick={expand}
            className="flex min-h-11 grow cursor-pointer items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span id={titleId} className="grow text-[15px] font-semibold">
              {title}
            </span>
            <Count doneCount={doneCount} phone />
          </button>
          <Controls expanded={false} />
        </div>
        <Bar doneCount={doneCount} className="mr-3" />
        <NextLine guide={guide} phone />
      </section>
    </>
  );
}

function PhoneSheet({ guide }: { guide: SetupGuide }) {
  const { doneCount, collapse, complete } = useSetupGuide();
  const heading = useRef<HTMLHeadingElement>(null);
  useGuideFocus('heading', heading);
  return (
    <Drawer open onOpenChange={(open) => !open && collapse()}>
      {/* The sheet leaves by unmounting, and the bar that replaces it takes the focus. */}
      <DrawerContent
        data-testid="setup-guide"
        data-view="expanded"
        finalFocus={false}
        className="h-auto max-h-[85dvh] bg-card"
      >
        <DrawerHeader className="flex-col items-stretch gap-2.5 border-b border-muted pt-2.5 pr-3 pb-3 pl-[18px]">
          <div className="flex items-center gap-1.5">
            <DrawerTitle
              ref={heading}
              tabIndex={-1}
              className="grow text-base font-semibold outline-none"
            >
              {title}
            </DrawerTitle>
            <Count doneCount={doneCount} phone />
            <Controls expanded />
          </div>
          <Bar doneCount={doneCount} />
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-1 px-2.5 pt-2 pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))]">
          {complete && <FinishedLine />}
          <SetupGuideSteps guide={guide} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

export function SetupGuidePanel() {
  const { guide, view, phone } = useSetupGuide();
  if (!guide || (view !== 'expanded' && view !== 'collapsed')) return null;
  if (phone) return view === 'expanded' ? <PhoneSheet guide={guide} /> : <PhoneBar guide={guide} />;
  return <DesktopWindow guide={guide} expanded={view === 'expanded'} />;
}

function Ring({ doneCount, size }: { doneCount: number; size: 'pill' | 'ring' }) {
  const box = size === 'pill' ? 18 : 22;
  const radius = size === 'pill' ? 7 : 8.5;
  const stroke = size === 'pill' ? 2.5 : 3;
  const length = 2 * Math.PI * radius;
  return (
    <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} aria-hidden="true">
      <circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-border"
      />
      <circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${((doneCount / totalSteps) * length).toFixed(1)} ${length.toFixed(1)}`}
        transform={`rotate(-90 ${box / 2} ${box / 2})`}
        className="stroke-primary"
      />
    </svg>
  );
}

export function SetupGuideHeaderButton({
  variant,
  className,
}: {
  variant: 'pill' | 'ring';
  className?: string;
}) {
  const { view, phone, doneCount, reopen } = useSetupGuide();
  const button = useRef<HTMLButtonElement>(null);
  const shown = view === 'closed' && phone === (variant === 'ring');
  useGuideFocus(shown ? 'header-button' : null, button);
  if (!shown) return null;
  const name = `${title}, ${doneCount} din ${totalSteps} pași făcuți`;
  const shared =
    'shrink-0 cursor-pointer border border-input bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50';
  let content: ReactNode;
  if (variant === 'ring') {
    content = <Ring doneCount={doneCount} size="ring" />;
  } else {
    content = (
      <>
        {title}
        <span className="font-medium text-muted-foreground tabular-nums">
          {doneCount}/{totalSteps}
        </span>
        <Ring doneCount={doneCount} size="pill" />
      </>
    );
  }
  return (
    <button
      ref={button}
      type="button"
      data-testid={variant === 'ring' ? 'setup-guide-ring' : 'setup-guide-pill'}
      aria-label={name}
      onClick={() => reopen('pill')}
      className={cn(
        shared,
        variant === 'ring'
          ? "relative grid size-10 place-items-center rounded-full p-0 after:absolute after:-inset-0.5 after:content-['']"
          : 'inline-flex h-8 items-center gap-2 rounded-full pr-2 pl-3 text-[13px] font-semibold whitespace-nowrap',
        className
      )}
    >
      {content}
    </button>
  );
}
