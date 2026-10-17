import { Link } from '@tanstack/react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/page';
import { useAuth } from '@/features/auth/auth-context';
import {
  participationKindLabels,
  useParticipations,
} from '@/features/participation/participation-context';
import { SignOutButton } from '@/features/participation/sign-out-button';
import { formatSignInAddress } from '@/lib/format';

export function AccountPage() {
  const { session } = useAuth();
  const { participations, participation } = useParticipations();
  if (!participation) return null;

  return (
    <main data-testid="account-page" className="grid gap-6">
      <PageHeader title="Contul meu" />
      <dl className="divide-y rounded-xl border bg-card px-4 shadow-xs">
        <Row label="Intri cu">
          <span data-testid="account-address" className="wrap-anywhere">
            {session ? formatSignInAddress(session.user) : ''}
          </span>
        </Row>
        <Row
          label="Compania"
          action={
            participations.length > 1 && (
              <Link
                to="/alege"
                data-testid="account-switch"
                className="inline-flex min-h-11 items-center px-2 font-medium underline underline-offset-4"
              >
                Schimbă
              </Link>
            )
          }
        >
          <span data-testid="account-client">{participation.clientName}</span>
          <span className="block text-sm text-muted-foreground">
            {participationKindLabels[participation.kind]}
          </span>
        </Row>
        <Row label="Prestator SSM">
          <span data-testid="account-provider">{participation.organizationName}</span>
        </Row>
      </dl>
      <Link
        to="/informare"
        data-testid="account-privacy-notice"
        className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 font-medium shadow-xs transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ShieldCheck aria-hidden="true" className="size-5 text-muted-foreground" />
        <span className="flex-1">Cum folosim datele tale</span>
        <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
      </Link>
      <SignOutButton />
    </main>
  );
}

function Row({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd>{children}</dd>
      </div>
      {action}
    </div>
  );
}
