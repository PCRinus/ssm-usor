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
import { Link, Outlet, useLocation, useMatches, useNavigate } from '@tanstack/react-router';
import { Building2, ChevronsUpDown, LayoutDashboard, LogOut, UserRound, Users } from 'lucide-react';
import { Fragment, useState } from 'react';

import { useMe } from '../account/use-me';
import { useAuth } from '../auth/auth-context';
import { CommitVersion } from './commit-version';
import { Notice } from './notice';

function loaderCrumb(loaderData: unknown) {
  const crumb = (loaderData as { crumb?: unknown } | undefined)?.crumb;
  return typeof crumb === 'string' ? crumb : undefined;
}

const navigation = [
  { to: '/dashboard', label: 'Prezentare generală', icon: LayoutDashboard },
  { to: '/clients', label: 'Clienți', icon: Users },
  { to: '/organization', label: 'Organizație', icon: Building2 },
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
  pending,
  onSignOut,
}: {
  email: string;
  // Both are missing while the account loads, and for an account that has neither.
  name?: string;
  organizationName?: string;
  pending: boolean;
  onSignOut: () => Promise<void>;
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
                {navigation.map(({ to, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild isActive={pathname === to} tooltip={label}>
                      <Link
                        to={to}
                        data-testid={`nav-${to.slice(1)}`}
                        aria-current={pathname === to ? 'page' : undefined}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = session?.user.email ?? 'Contul meu';
  // A failed load leaves the menu with the email alone; the pages report the failure.
  const me = useMe();

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
    <SidebarProvider className="flex-col">
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
      <div className="flex min-h-[calc(100svh-4rem)] flex-1">
        <AppNavigation
          email={email}
          name={me.data?.profile?.fullName}
          organizationName={me.data?.membership?.organization.name}
          pending={pending}
          onSignOut={signOut}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 outline-none sm:px-8 lg:px-10"
          >
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
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 text-xs text-muted-foreground sm:px-8 lg:px-10">
            <span>© {new Date().getFullYear()} SSM Ușor</span>
            <CommitVersion />
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
