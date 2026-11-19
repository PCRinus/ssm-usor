import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { getRouteApi, Link } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import {
  getGetOrganizationSeatsQueryKey,
  getListInvitationsQueryKey,
  getListOrganizationMembersQueryKey,
  useGetOrganizationSeats,
  useListInvitations,
  useListOrganizationMembers,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { keepOpener, openedHere } from '@/app/opener';
import { DataTable } from '@/components/data-table/data-table';
import { HelpLink } from '@/components/help-link';
import { ListCardHeader } from '@/components/list-card-header';
import { Notice } from '@/components/notice';
import {
  memberSeatsOf,
  membersLabel,
  seatsLabel,
  upgradeSearch,
} from '@/features/subscription/member-seats';

import { InviteMemberDialog } from './invite-member-dialog';
import { teamColumns } from './team-columns';
import { defaultTeamSort, type TeamRow, teamRows, type TeamSortKey } from './team-list';

const route = getRouteApi('/_authenticated/organizatie/echipa');

const rowKey = (row: TeamRow) =>
  row.kind === 'member' ? `member-${row.member.userId}` : `invitation-${row.invitation.id}`;

const noInvitations: never[] = [];

const rowTestId = (row: TeamRow) => (row.kind === 'member' ? 'member-row' : 'invitation-row');

// `manage` is an owner's view: the invitations, the activity, the menus and the invite button.
// Hiding them is a courtesy; the API and the database refuse the actions to anyone else.
export function TeamCard({
  userId,
  manage,
  canAct,
}: {
  userId: string;
  manage: boolean;
  // May change the plan: an owner in person, not an admin acting as one.
  canAct: boolean;
}) {
  const { request, key } = useApi();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const members = useListOrganizationMembers({
    request,
    query: { queryKey: key(getListOrganizationMembersQueryKey()) },
  });
  const seatCounts = useGetOrganizationSeats({
    request,
    query: { queryKey: key(getGetOrganizationSeatsQueryKey()) },
  });
  const seats = seatCounts.data ? memberSeatsOf(seatCounts.data, canAct) : null;
  const invitations = useListInvitations({
    request,
    query: { queryKey: key(getListInvitationsQueryKey()), enabled: manage },
  });

  // Only an owner reads the activity it sorts by.
  const sortKey: TeamSortKey = manage ? (search.sort ?? defaultTeamSort.sort) : 'name';
  const sort = { sort: sortKey, order: search.order ?? defaultTeamSort.order };
  const memberItems = members.data?.items;
  const invitationItems = manage ? invitations.data?.items : noInvitations;
  const rows = useMemo(
    () =>
      memberItems && invitationItems
        ? teamRows(memberItems, invitationItems, { sort: sortKey, order: sort.order })
        : undefined,
    [memberItems, invitationItems, sortKey, sort.order]
  );
  const columns = useMemo(
    () => teamColumns({ userId, manage, onError: setError }),
    [userId, manage]
  );

  const failed = members.isError || (manage && invitations.isError);
  const status = failed ? 'error' : rows ? 'success' : 'pending';
  const retry = () => {
    if (members.isError) void members.refetch();
    if (invitations.isError) void invitations.refetch();
  };

  return (
    <div data-testid="team-card">
      <h2 className="sr-only">Echipă</h2>
      <ListCardHeader
        className={cn('max-sm:px-4', seats?.upgrade ? 'max-sm:gap-y-2' : 'flex-nowrap')}
      >
        <div
          className={cn(
            'flex min-h-9 min-w-0 items-center gap-1.5',
            seats?.upgrade && 'max-sm:w-full'
          )}
        >
          {seats && (
            <span
              data-testid="team-seats"
              data-full={(manage && seats.full) || undefined}
              aria-live="polite"
              className={cn(
                'text-sm whitespace-nowrap tabular-nums',
                manage && seats.full && 'font-medium text-warning-foreground'
              )}
            >
              {manage ? seatsLabel(seats) : membersLabel(seats)}
            </span>
          )}
          <HelpLink
            topic="organizatie.echipa"
            label="Ajutor: echipa, rolurile și locurile planului"
          />
        </div>
        {manage && (
          <div
            className={cn(
              'ml-auto flex shrink-0 items-center gap-2',
              seats?.upgrade && 'max-sm:grid max-sm:w-full max-sm:grid-cols-2'
            )}
          >
            <Button
              data-testid="invite-open"
              variant={seats?.upgrade ? 'outline' : 'default'}
              className="max-sm:px-3"
              onClick={() => setInviting(true)}
            >
              <UserPlus aria-hidden="true" className="max-sm:hidden" />
              Invită un membru
            </Button>
            {seats?.upgrade && (
              <Button asChild data-testid="team-upgrade" className="max-sm:px-3">
                <Link to="/organizatie/abonament/alege" state={openedHere} search={upgradeSearch}>
                  Treci pe Profesional
                </Link>
              </Button>
            )}
          </div>
        )}
      </ListCardHeader>
      {error && (
        <div className="border-b px-5 py-3">
          <Notice variant="destructive" data-testid="team-error">
            {error}
          </Notice>
        </div>
      )}
      <DataTable
        testId="team-table"
        rowTestId={rowTestId}
        label={manage ? 'Membrii și invitațiile organizației' : 'Membrii organizației'}
        columns={columns}
        data={rows}
        rowKey={rowKey}
        status={status}
        sort={sort}
        onSortChange={(next) =>
          void navigate({
            state: keepOpener,
            replace: true,
            resetScroll: false,
            search: (prev) => ({
              ...prev,
              sort: next.sort === defaultTeamSort.sort ? undefined : (next.sort as TeamSortKey),
              order: next.order === defaultTeamSort.order ? undefined : next.order,
            }),
          })
        }
        error={
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={members.isFetching || invitations.isFetching}
                onClick={retry}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca echipa.
          </Notice>
        }
        empty={null}
      />
      {manage && (
        <InviteMemberDialog open={inviting} seats={seats} onClose={() => setInviting(false)} />
      )}
    </div>
  );
}
