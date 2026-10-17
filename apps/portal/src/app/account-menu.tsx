import { Trans, useLingui } from '@lingui/react/macro';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { ArrowLeftRight, ChevronDown, CircleUserRound, LogOut } from 'lucide-react';

import { useSignOut } from '@/features/auth/use-sign-out';
import {
  type Participation,
  useParticipations,
} from '@/features/participation/participation-context';
import { initialsOf } from '@/lib/format';

export function AccountMenu({ participation }: { participation: Participation }) {
  const { t } = useLingui();
  const { participations } = useParticipations();
  const { signOut, busy, failed } = useSignOut();

  return (
    <div className="flex items-center gap-3">
      {failed && (
        <p role="alert" data-testid="account-menu-error" className="text-sm text-destructive">
          <Trans>Nu am putut ieși din cont.</Trans>
        </p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="account-menu"
          aria-label={t`Contul tău: ${participation.fullName}, ${participation.clientName}`}
          className="flex max-w-72 items-center gap-3 rounded-full py-1.5 pr-2.5 pl-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted"
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[0.8125rem] font-bold text-brand-lime"
          >
            {initialsOf(participation.fullName)}
          </span>
          <span className="hidden min-w-0 flex-col leading-tight lg:flex">
            <span className="truncate text-sm font-semibold">{participation.fullName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {participation.clientName}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          {participations.length > 1 && (
            <DropdownMenuItem asChild data-testid="account-menu-switch">
              <Link to="/alege">
                <ArrowLeftRight aria-hidden="true" />
                <Trans>Schimbă clientul</Trans>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild data-testid="account-menu-account">
            <Link to="/contul-meu">
              <CircleUserRound aria-hidden="true" />
              <Trans>Contul meu</Trans>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="account-menu-sign-out"
            disabled={busy}
            onSelect={() => void signOut()}
          >
            <LogOut aria-hidden="true" />
            <Trans>Ieși din cont</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
