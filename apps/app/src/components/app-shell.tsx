import { Avatar, AvatarFallback } from '@ssm-usor/ui/components/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@ssm-usor/ui/components/breadcrumb';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Separator } from '@ssm-usor/ui/components/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@ssm-usor/ui/components/sidebar';
import { useSidebar } from '@ssm-usor/ui/hooks/use-sidebar';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, Outlet, useLocation, useMatches, useNavigate } from '@tanstack/react-router';
import {
  BookOpenText,
  Building2,
  ChevronsUpDown,
  Handshake,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  UserRound,
  Users,
} from 'lucide-react';
import { Fragment, useState } from 'react';

import { useMe } from '../account/use-me';
import { useAuth } from '../auth/auth-context';
import { usePostHogSession } from '../observability/use-posthog-session';
import { CommitVersion } from './commit-version';
import { Notice } from './notice';
import { loaderCrumb } from './route-title';

// `ownerOnly`: a specialist has no leads to see (ADR 007).
const navigation = [
  { to: '/dashboard', label: 'Prezentare generală', icon: LayoutDashboard, ownerOnly: false },
  { to: '/leads', label: 'Clienți potențiali', icon: Handshake, ownerOnly: true },
  { to: '/clients', label: 'Clienți', icon: Users, ownerOnly: false },
  { to: '/instructions', label: 'Instrucțiuni', icon: BookOpenText, ownerOnly: false },
  { to: '/organization', label: 'Organizație', icon: Building2, ownerOnly: false },
] as const;

function initials(name: string | undefined, email: string) {
  const words = name?.split(/\s+/).filter(Boolean) ?? [];
  const letters = words.length > 1 ? `${words[0]![0]}${words.at(-1)![0]}` : (words[0] ?? email);
  return letters.slice(0, 2).toUpperCase();
}

function AppNavigation({
  email,
  name,
  organizationName,
  isOwner,
  pending,
  onSignOut,
  onReportProblem,
  unreadCount,
}: {
  email: string;
  // Both are missing while the account loads, and for an account that has neither.
  name?: string;
  organizationName?: string;
  isOwner: boolean;
  pending: boolean;
  onSignOut: () => Promise<void>;
  onReportProblem: () => Promise<void>;
  unreadCount: number;
}) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" className="sticky top-16 bottom-auto h-[calc(100svh-4rem)]">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Navigare principală">
              <SidebarMenu>
                {navigation
                  .filter((item) => isOwner || !item.ownerOnly)
                  .map(({ to, label, icon: Icon }) => {
                    const inside = pathname === to || pathname.startsWith(`${to}/`);
                    return (
                      <SidebarMenuItem key={to}>
                        <SidebarMenuButton asChild isActive={inside} tooltip={label}>
                          <Link
                            to={to}
                            data-testid={`nav-${to.slice(1)}`}
                            aria-current={pathname === to ? 'page' : inside ? 'true' : undefined}
                            onClick={() => {
                              if (isMobile) setOpenMobile(false);
                            }}
                          >
                            <Icon aria-hidden="true" />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Raportează o problemă"
              data-testid="report-problem"
              onClick={() => {
                if (isMobile) setOpenMobile(false);
                void onReportProblem();
              }}
            >
              <MessageSquareWarning aria-hidden="true" />
              <span>Raportează o problemă</span>
              {unreadCount > 0 && (
                <span
                  className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
                  aria-label={`${unreadCount} răspunsuri necitite`}
                >
                  {unreadCount}
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  data-testid="account-menu"
                  aria-label="Meniul contului"
                  disabled={pending}
                  className="data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-0!"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials(name, email)}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span data-testid="account-name" className="truncate font-medium">
                      {name ?? 'Contul meu'}
                    </span>
                    <span
                      data-testid="account-organization"
                      className="truncate text-xs text-muted-foreground"
                    >
                      {organizationName ?? email}
                    </span>
                  </div>
                  <ChevronsUpDown
                    className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
                    aria-hidden="true"
                  />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? 'top' : 'right'}
                align="end"
                sideOffset={8}
                className="w-64"
              >
                <DropdownMenuLabel className="grid gap-0.5">
                  {name && <span className="truncate">{name}</span>}
                  <span className="font-normal break-all text-muted-foreground">{email}</span>
                  {organizationName && (
                    <span
                      data-testid="account-menu-organization"
                      className="mt-1 truncate text-xs font-normal text-muted-foreground"
                    >
                      {organizationName}
                    </span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild data-testid="account-profile">
                  <Link to="/profile">
                    <UserRound aria-hidden="true" />
                    Profilul meu
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild data-testid="account-organization-link">
                  <Link to="/organization">
                    <Building2 aria-hidden="true" />
                    Organizație
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="account-sign-out"
                  disabled={pending}
                  onSelect={() => void onSignOut()}
                >
                  <LogOut aria-hidden="true" />
                  Deconectare
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell() {
  const { auth, session } = useAuth();
  const navigate = useNavigate();
  // A route whose title depends on data returns it as `crumb` from its loader; a static title
  // beside it stands in when the loader has no name to give.
  const trail = useMatches({
    select: (matches) =>
      matches.flatMap((match) => {
        const label = loaderCrumb(match.loaderData) ?? match.staticData.title;
        return label ? [{ to: match.pathname, label }] : [];
      }),
  });
  const editorPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.editorPage),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = session?.user.email ?? 'Contul meu';
  // A failed load leaves the menu with the email alone; the pages report the failure.
  const me = useMe();
  const { openSupport, unreadCount } = usePostHogSession(me.data);

  async function reportProblem() {
    if (await openSupport()) return;
    window.location.href = 'mailto:contact@ssmusor.ro?subject=Problem%C4%83%20SSM%20U%C8%99or';
  }

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      await auth.signOut();
      await navigate({ to: '/login', replace: true });
    } catch {
      setError('Deconectarea nu a reușit. Verifică conexiunea și încearcă din nou.');
    } finally {
      setPending(false);
    }
  }

  return (
    <SidebarProvider
      className={cn('flex-col', editorPage && 'fixed inset-0 h-dvh min-h-0 overflow-hidden')}
    >
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-card p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Sari la conținut
      </a>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <SidebarTrigger data-testid="sidebar-toggle" aria-label="Comută meniul lateral" />
          <Separator orientation="vertical" className="!h-6" />
          <Link to="/dashboard" aria-label="SSM Ușor — pagina principală">
            <img
              data-testid="app-logo"
              src="/brand/logo.png"
              alt="SSM Ușor"
              width={2172}
              height={724}
              className="h-auto w-28 sm:w-36"
            />
          </Link>
        </div>
      </header>
      <div
        className={cn(
          'flex flex-1',
          editorPage ? 'min-h-0 overflow-hidden' : 'min-h-[calc(100svh-4rem)]'
        )}
      >
        <AppNavigation
          email={email}
          name={me.data?.profile?.fullName}
          organizationName={me.data?.membership?.organization.name}
          isOwner={me.data?.membership?.role === 'owner'}
          pending={pending}
          onSignOut={signOut}
          onReportProblem={reportProblem}
          unreadCount={unreadCount}
        />
        <div className={cn('flex min-w-0 flex-1 flex-col', editorPage && 'min-h-0')}>
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              'mx-auto w-full flex-1 outline-none',
              editorPage
                ? 'flex min-h-0 max-w-none flex-col overflow-hidden px-3 py-3 sm:px-5'
                : 'max-w-7xl px-5 py-6 sm:px-8 lg:px-10'
            )}
          >
            {!editorPage && (
              <Breadcrumb className="mb-7">
                <BreadcrumbList>
                  {trail.map((crumb, index) => (
                    <Fragment key={crumb.to}>
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem>
                        {index === trail.length - 1 ? (
                          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.to}>{crumb.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            )}
            {error && (
              <Notice
                variant="destructive"
                data-testid="sign-out-error"
                className="mb-6"
                action={
                  <Button
                    data-testid="sign-out-retry"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void signOut()}
                  >
                    Reîncearcă deconectarea
                  </Button>
                }
              >
                {error}
              </Notice>
            )}
            <Outlet />
          </main>
          {!editorPage && (
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 text-xs text-muted-foreground sm:px-8 lg:px-10">
              <span>© {new Date().getFullYear()} SSM Ușor</span>
              <CommitVersion />
            </footer>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
