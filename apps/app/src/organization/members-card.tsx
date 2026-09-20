import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getListOrganizationMembersQueryKey,
  useListOrganizationMembers,
} from '../api/generated/api';
import { Notice } from '../components/notice';
import { formatDay, roleLabels } from './labels';
import { MemberActions } from './member-actions';

// `canManage` adds an owner's row menu for everyone but themselves. Hiding it is a courtesy;
// the database refuses the actions to anyone else.
export function MembersCard({ userId, canManage }: { userId: string; canManage: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const members = useListOrganizationMembers({
    request: apiRequest,
    query: { queryKey: [...getListOrganizationMembersQueryKey(), userId] },
  });

  return (
    <Card data-testid="members-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Membri</h2>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Notice variant="destructive" data-testid="members-error">
            {error}
          </Notice>
        )}
        {members.isError ? (
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={members.isFetching}
                onClick={() => void members.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca membrii organizației.
          </Notice>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nume și prenume</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Membru din</TableHead>
                {canManage && (
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.isPending ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 5 : 4}>
                    <Skeleton className="h-5 w-full" />
                    <span className="sr-only" role="status">
                      Se încarcă membrii…
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                members.data.items.map((member) => (
                  <TableRow key={member.userId} data-testid="member-row">
                    <TableCell className="font-medium">
                      {member.fullName ?? <span className="text-muted-foreground">Fără nume</span>}
                      {member.userId === userId && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">(tu)</span>
                      )}
                    </TableCell>
                    <TableCell className="break-all">{member.email ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                        {roleLabels[member.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {formatDay(member.joinedAt)}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {member.userId !== userId && (
                          <MemberActions member={member} onError={setError} />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
