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
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '../auth/auth-context';

const navigation = [
  { to: '/dashboard', label: 'Prezentare generală', icon: LayoutDashboard },
  { to: '/clients', label: 'Clienți', icon: Users },
] as const;

function AppNavigation({
  email,
  pending,
  onSignOut,
}: {
  email: string;
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
                  aria-label="Meniul contului"
                  disabled={pending}
                  className="data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-0!"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {email.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">Contul meu</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
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
                <DropdownMenuLabel className="break-all">{email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={pending} onSelect={() => void onSignOut()}>
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
  const pathname = useLocation({ select: (location) => location.pathname });
  const currentPage = navigation.find((item) => item.to === pathname)?.label ?? 'Spațiul de lucru';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = session?.user.email ?? 'Contul meu';

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
          <SidebarTrigger aria-label="Comută meniul lateral" />
          <Separator orientation="vertical" className="!h-6" />
          <Link to="/dashboard" aria-label="SSM Ușor — pagina principală">
            <img
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
        <AppNavigation email={email} pending={pending} onSignOut={signOut} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 outline-none sm:px-8 lg:px-10"
          >
            <Breadcrumb className="mb-7">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/dashboard">Spațiul de lucru</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentPage}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {error && (
              <div
                role="alert"
                className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
              >
                <p>{error}</p>
                <Button variant="outline" disabled={pending} onClick={() => void signOut()}>
                  Reîncearcă deconectarea
                </Button>
              </div>
            )}
            <Outlet />
          </main>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 text-xs text-muted-foreground sm:px-8 lg:px-10">
            <span>© {new Date().getFullYear()} SSM Ușor</span>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
