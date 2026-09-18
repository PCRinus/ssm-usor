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

import {
  getListOrganizationMembersQueryKey,
  useListOrganizationMembers,
} from '../api/generated/api';
import { formatDay, roleLabels } from './labels';

export function MembersCard({ userId }: { userId: string }) {
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
      <CardContent>
        {members.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <p>Nu am putut încărca membrii organizației.</p>
            <Button
              variant="outline"
              disabled={members.isFetching}
              onClick={() => void members.refetch()}
            >
              Încearcă din nou
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nume</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Membru din</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.isPending ? (
                <TableRow>
                  <TableCell colSpan={4}>
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
