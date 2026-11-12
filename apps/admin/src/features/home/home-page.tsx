import type { CurrentUser } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ChevronRight, FileStack, type LucideIcon, UsersRound } from 'lucide-react';

import { apiFetch, isRefusedByApi } from '@/api/http';
import { AdminShell } from '@/components/admin-shell';
import { ErrorNotice } from '@/components/error-notice';
import { Frame } from '@/components/frame';
import { SignOutButton } from '@/features/auth/sign-out-button';

export function HomePage() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const me = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: ({ signal }) => apiFetch<CurrentUser>('/api/me', { ...apiRequest, signal }),
  });

  if (me.isPending) {
    return (
      <main className="grid min-h-svh place-items-center px-4">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </main>
    );
  }

  if (me.isError) {
    if (isRefusedByApi(me.error)) {
      return (
        <Frame
          testId="no-admin-access"
          title="This account has no admin access"
          description="Sign out and sign in with an admin account."
        >
          <SignOutButton />
        </Frame>
      );
    }
    return (
      <Frame testId="home-error" title="The admin API did not answer">
        <ErrorNotice>Check the connection and try again.</ErrorNotice>
        <Button onClick={() => void me.refetch()}>Try again</Button>
        <SignOutButton />
      </Frame>
    );
  }

  return (
    <AdminShell testId="home-page">
      <p className="text-muted-foreground">
        Signed in as{' '}
        <span data-testid="admin-email" className="text-foreground font-medium break-all">
          {me.data.email}
        </span>
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <HomeCard
          to="/imports"
          testId="home-imports"
          icon={FileStack}
          title="Imports"
          description="Every organization’s imports, their flags, reports and improvement copies"
        />
        <HomeCard
          to="/members"
          testId="home-members"
          icon={UsersRound}
          title="Members"
          description="Every organization’s members, to act as one of them for support"
        />
      </div>
    </AdminShell>
  );
}

function HomeCard({
  to,
  testId,
  icon: Icon,
  title,
  description,
}: {
  to: '/imports' | '/members';
  testId: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="bg-background hover:bg-muted/60 flex items-center gap-4 rounded-xl border p-4 transition-colors"
    >
      <Icon aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{description}</span>
      </span>
      <ChevronRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
    </Link>
  );
}
