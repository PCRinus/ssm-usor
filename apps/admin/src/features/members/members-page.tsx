import type { AdminMemberListItem, CurrentUser } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/api/http';
import { AdminShell } from '@/components/admin-shell';
import { ListTable } from '@/components/list-table';
import { useActiveImpersonation } from '@/features/impersonation/api';
import { RecentImpersonations } from '@/features/impersonation/recent-impersonations';
import { StartImpersonationDialog } from '@/features/impersonation/start-dialog';
import { formatDateTime } from '@/lib/format';
import { pageParam } from '@/lib/search';

import {
  fetchMembers,
  maxMemberSearchLength,
  type MembersSearch,
  planLabels,
  roleLabels,
  subscriptionStatusLabels,
} from './api';

const columns = [
  'Name',
  'Email',
  'Organization',
  'Role',
  'Plan',
  'Last sign-in',
  <span key="actions" className="sr-only">
    Actions
  </span>,
];

const searchDelay = 300;

function Plan({ subscription }: { subscription: AdminMemberListItem['subscription'] }) {
  if (!subscription) return <span className="text-muted-foreground">None</span>;
  return (
    <span>
      {planLabels[subscription.plan]}
      <span className="text-muted-foreground">
        {' '}
        · {subscriptionStatusLabels[subscription.status]}
      </span>
    </span>
  );
}

export function MembersPage({ search }: { search: MembersSearch }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: '/members' });
  const me = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: ({ signal }) => apiFetch<CurrentUser>('/api/me', { ...apiRequest, signal }),
  });
  const members = useQuery({
    queryKey: ['admin', 'members', search],
    queryFn: ({ signal }) => fetchMembers(search, { ...apiRequest, signal }),
    placeholderData: keepPreviousData,
  });
  const [text, setText] = useState(search.search ?? '');
  const [chosen, setChosen] = useState<AdminMemberListItem | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const active = useActiveImpersonation();
  const actingAs = active.data?.target.userId;

  const [seen, setSeen] = useState(search.search);
  if (seen !== search.search) {
    setSeen(search.search);
    if (text.trim() !== (search.search ?? '')) setText(search.search ?? '');
  }

  const typing = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(typing.current), []);

  function type(value: string) {
    setText(value);
    window.clearTimeout(typing.current);
    typing.current = window.setTimeout(() => {
      const next = value.trim() || undefined;
      void navigate({ search: (previous) => ({ ...previous, search: next, page: undefined }) });
    }, searchDelay);
  }

  return (
    <AdminShell testId="members-page" wide>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every organization’s members. Act as one to see the member app as they do; each
          impersonation is recorded in the audit log.
        </p>
      </div>

      <div className="mb-4 w-full space-y-1.5 sm:max-w-sm">
        <Label htmlFor="members-search">Search</Label>
        <Input
          id="members-search"
          data-testid="members-search"
          type="search"
          placeholder="Email, name or organization"
          maxLength={maxMemberSearchLength}
          value={text}
          onChange={(event) => type(event.target.value)}
        />
      </div>

      <ListTable
        query={members}
        testId="members-table"
        label="Members"
        columns={columns}
        empty={search.search ? 'No member matches this search.' : 'No members yet.'}
        row={(member) => (
          <TableRow
            key={`${member.userId}:${member.organization.id}`}
            data-testid="member-row"
            className="align-top"
          >
            <TableCell className="max-w-56 min-w-36 font-medium whitespace-normal">
              {member.fullName ?? <span className="text-muted-foreground">—</span>}
              {member.userId === actingAs && (
                <Badge
                  variant="outline"
                  data-testid="member-acting"
                  className="border-warning-border bg-warning text-warning-foreground ml-2 align-middle"
                >
                  Acting
                </Badge>
              )}
            </TableCell>
            <TableCell>{member.email ?? '—'}</TableCell>
            <TableCell className="max-w-56 min-w-36 whitespace-normal">
              {member.organization.name}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{roleLabels[member.role]}</Badge>
            </TableCell>
            <TableCell>
              <Plan subscription={member.subscription} />
            </TableCell>
            <TableCell className="tabular-nums">{formatDateTime(member.lastSignInAt)}</TableCell>
            <TableCell className="text-right">
              {me.data && member.userId !== me.data.id && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="act-as"
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setChosen(member);
                  }}
                >
                  Act as
                </Button>
              )}
            </TableCell>
          </TableRow>
        )}
        pager={{
          noun: { one: 'member', many: 'members' },
          onPage: (page) =>
            void navigate({
              search: (previous) => ({ ...previous, page: pageParam(page) }),
            }),
        }}
      />

      <RecentImpersonations />

      <StartImpersonationDialog member={chosen} opener={opener} onClose={() => setChosen(null)} />
    </AdminShell>
  );
}
