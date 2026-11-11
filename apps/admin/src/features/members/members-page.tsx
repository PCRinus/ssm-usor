import type { AdminMemberListItem, CurrentUser } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/api/http';
import { AdminShell, LoadFailure } from '@/components/admin-shell';
import { Pager } from '@/components/pager';
import { RecentImpersonations } from '@/features/impersonation/recent-impersonations';
import { StartImpersonationDialog } from '@/features/impersonation/start-dialog';
import { formatDateTime } from '@/lib/format';

import {
  fetchMembers,
  maxMemberSearchLength,
  type MembersSearch,
  planLabels,
  roleLabels,
  subscriptionStatusLabels,
} from './api';

const columns = ['Name', 'Email', 'Organization', 'Role', 'Plan', 'Last sign-in', ''] as const;

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

      {members.isError && !members.data ? (
        <LoadFailure error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <div className="bg-background overflow-hidden rounded-xl border">
          <Table
            data-testid="members-table"
            aria-label="Members"
            aria-busy={members.isPlaceholderData || undefined}
          >
            <TableHeader>
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead key={index}>
                    {column || <span className="sr-only">Actions</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className={cn(members.isPlaceholderData && 'opacity-50')}>
              {members.isPending ? (
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {columns.map((column, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : members.data.items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="text-muted-foreground h-40 text-center"
                  >
                    {search.search ? 'No member matches this search.' : 'No members yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                members.data.items.map((member) => (
                  <TableRow
                    key={`${member.userId}:${member.organization.id}`}
                    data-testid="member-row"
                    className="align-top"
                  >
                    <TableCell className="max-w-56 min-w-36 font-medium whitespace-normal">
                      {member.fullName ?? <span className="text-muted-foreground">—</span>}
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
                    <TableCell className="tabular-nums">
                      {formatDateTime(member.lastSignInAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {me.data && member.userId !== me.data.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid="act-as"
                          onClick={() => setChosen(member)}
                        >
                          Act as
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {members.data && (
            <Pager
              noun={{ one: 'member', many: 'members' }}
              page={members.data.page}
              pageSize={members.data.pageSize}
              total={members.data.total}
              disabled={members.isFetching}
              onPage={(page) =>
                void navigate({
                  search: (previous) => ({ ...previous, page: page > 1 ? page : undefined }),
                })
              }
            />
          )}
        </div>
      )}

      <RecentImpersonations />

      <StartImpersonationDialog member={chosen} onClose={() => setChosen(null)} />
    </AdminShell>
  );
}
