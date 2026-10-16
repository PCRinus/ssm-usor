import { getRouteApi, Link, Outlet } from '@tanstack/react-router';
import { ClipboardCheck, UsersRound } from 'lucide-react';

import { SectionNav } from '@/components/section-nav';

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

const views = [
  { to: '/clients/$clientId/employees', label: 'Angajați', icon: UsersRound, exact: true },
  {
    to: '/clients/$clientId/employees/trainings',
    label: 'Instruiri',
    icon: ClipboardCheck,
    exact: false,
  },
] as const;

export function EmployeesSectionLayout() {
  const { client } = clientRoute.useLoaderData();
  return (
    <div className="space-y-5">
      <SectionNav label="Vederile angajaților" nested>
        {views.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="shrink-0">
            <Link
              to={to}
              params={{ clientId: client.id }}
              resetScroll={false}
              activeOptions={{ exact, includeSearch: false }}
              data-testid="employees-view"
              className="inline-flex h-9 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
              activeProps={{ 'aria-current': 'page' }}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </SectionNav>
      <Outlet />
    </div>
  );
}
