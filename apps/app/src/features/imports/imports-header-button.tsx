import { Button } from '@ssm-usor/ui/components/button';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { Progress } from '@ssm-usor/ui/components/progress';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Building2, ChevronRight, CircleAlert, ScanText, UsersRound, X } from 'lucide-react';
import { type ComponentProps, useId, useMemo, useState } from 'react';

import {
  accessibleName,
  headline,
  openCount,
  type OpenImport,
  type OpenImports,
  openImportsOf,
} from './open-imports';
import { useMyImports } from './use-my-imports';

const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

// Below lg the header also holds the plan badge and the setup guide's pill, which leave a tablet
// no room for the label: the button stays round there, as on a phone.
function Trigger({ groups, ...props }: { groups: OpenImports } & ComponentProps<'button'>) {
  const waiting = groups.ready.length > 0;
  return (
    <button
      type="button"
      data-testid="imports-button"
      aria-label={accessibleName(groups)}
      className={cn(
        'relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-input bg-card text-[13px] font-semibold whitespace-nowrap text-foreground hover:bg-muted aria-expanded:border-foreground aria-expanded:bg-muted lg:inline-flex lg:h-8 lg:w-auto lg:gap-2 lg:pr-1.5 lg:pl-2.5',
        focusRing
      )}
      {...props}
    >
      <ScanText aria-hidden="true" className="size-[18px] lg:hidden" />
      <span
        aria-hidden="true"
        data-testid="imports-button-dot"
        className={cn(
          'absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-card px-1 text-[11px] leading-none font-bold tabular-nums lg:hidden',
          waiting ? 'bg-brand-lime' : 'bg-muted'
        )}
      >
        {waiting ? groups.ready.length : openCount(groups)}
      </span>
      <span aria-hidden="true" className="hidden lg:inline">
        Importuri
      </span>
      <span
        aria-hidden="true"
        data-testid="imports-button-chip"
        className={cn(
          'hidden h-[22px] items-center rounded-full px-2 text-xs font-semibold tabular-nums lg:inline-flex',
          waiting ? 'bg-brand-lime' : 'bg-muted'
        )}
      >
        {headline(groups)}
      </span>
    </button>
  );
}

export function ImportsHeaderButton() {
  const { items, userId } = useMyImports();
  const phone = useIsMobile();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const groups = useMemo(
    () => (items && userId ? openImportsOf(items, userId) : null),
    [items, userId]
  );
  if (!groups || openCount(groups) === 0) return null;
  const close = () => setOpen(false);

  if (phone) {
    return (
      <>
        <Trigger
          groups={groups}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        />
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent data-testid="imports-list" className="h-auto max-h-[85dvh] bg-card">
            <DrawerHeader className="justify-between pt-2 pr-2 pb-0">
              <DrawerTitle className="text-[17px] font-semibold">Importuri</DrawerTitle>
              <DrawerClose
                aria-label="Închide"
                className={cn('grid size-11 place-items-center rounded-[10px]', focusRing)}
              >
                <X aria-hidden="true" className="size-5" />
              </DrawerClose>
            </DrawerHeader>
            <DrawerBody className="px-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <ImportGroups groups={groups} phone onNavigate={close} />
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Trigger groups={groups} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        aria-labelledby={titleId}
        data-testid="imports-list"
        className="w-[440px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0"
      >
        <h2 id={titleId} className="px-4 pt-3.5 pb-0.5 text-[15px] font-semibold">
          Importuri
        </h2>
        <div className="max-h-[min(70vh,36rem)] overflow-y-auto">
          <ImportGroups groups={groups} phone={false} onNavigate={close} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

const sections = [
  { key: 'ready', title: 'De verificat' },
  { key: 'running', title: 'Se citesc' },
  { key: 'failed', title: 'S-au oprit' },
] as const;

function ImportGroups({
  groups,
  phone,
  onNavigate,
}: {
  groups: OpenImports;
  phone: boolean;
  onNavigate: () => void;
}) {
  const baseId = useId();
  return sections
    .filter((section) => groups[section.key].length > 0)
    .map((section) => (
      <section
        key={section.key}
        data-testid="imports-group"
        data-group={section.key}
        aria-labelledby={`${baseId}-${section.key}`}
        className="border-t border-border/60 first:border-t-0"
      >
        <h3
          id={`${baseId}-${section.key}`}
          className="px-4 pt-3 text-[12.5px] font-semibold text-muted-foreground"
        >
          {section.title}
        </h3>
        <ul>
          {groups[section.key].map((item) => (
            <li key={item.id} data-testid="imports-row">
              {section.key === 'running' ? (
                <RunningRow item={item} onNavigate={onNavigate} />
              ) : (
                <ActionRow item={item} tone={section.key} phone={phone} onNavigate={onNavigate} />
              )}
            </li>
          ))}
        </ul>
      </section>
    ));
}

function KindSquare({ item, tone }: { item: OpenImport; tone: 'ready' | 'running' | 'failed' }) {
  const Icon = tone === 'failed' ? CircleAlert : item.kind === 'employees' ? UsersRound : Building2;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 place-items-center rounded-xl',
        tone === 'ready' && 'bg-brand-lime text-foreground',
        tone === 'running' && 'bg-muted text-foreground',
        tone === 'failed' && 'bg-destructive-soft text-destructive'
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

function ActionRow({
  item,
  tone,
  phone,
  onNavigate,
}: {
  item: OpenImport;
  tone: 'ready' | 'failed';
  phone: boolean;
  onNavigate: () => void;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-x-3 gap-y-1.5 px-4 py-3',
        phone ? 'grid-cols-[2.5rem_minmax(0,1fr)]' : 'grid-cols-[2.5rem_minmax(0,1fr)_auto]'
      )}
    >
      <KindSquare item={item} tone={tone} />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{item.name}</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">{item.detail}</span>
      </span>
      <Button
        asChild
        size="sm"
        variant={tone === 'ready' ? 'default' : 'outline'}
        className={cn(phone && 'col-span-full mt-1.5 h-11 w-full text-[15px]')}
      >
        <Link {...item.link} onClick={onNavigate}>
          {item.action}
        </Link>
      </Button>
    </div>
  );
}

function RunningRow({ item, onNavigate }: { item: OpenImport; onNavigate: () => void }) {
  return (
    <Link
      {...item.link}
      onClick={onNavigate}
      className={cn(
        'grid grid-cols-[2.5rem_minmax(0,1fr)_1rem] items-center gap-x-3 px-4 py-3 hover:bg-muted/60',
        focusRing
      )}
    >
      <KindSquare item={item} tone="running" />
      <span className="grid min-w-0 gap-1.5">
        <span className="text-[15px] font-semibold">{item.name}</span>
        {item.progress !== null && (
          <Progress value={item.progress} aria-label={item.detail} className="h-2" />
        )}
        <span className="text-[13px] leading-snug text-muted-foreground tabular-nums">
          {item.detail}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
    </Link>
  );
}
