import { useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';

import {
  getListWorkplacesQueryKey,
  type ImportDetail,
  type JobPositionListResponse,
  useListWorkplaces,
  type WorkplaceListResponse,
} from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';
import { todayIso } from '@/features/employees/employee-format';
import { useJobPositionOptions } from '@/features/job-positions/use-job-position-options';

import type { Proposal, ReviewContext } from './employee-review-model';
import { useEmployeeReview } from './use-employee-review';

export type Position = JobPositionListResponse['items'][number];
export type Workplace = WorkplaceListResponse['items'][number];

export function useReviewContext(detail: ImportDetail, clientId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const review = useEmployeeReview(detail);
  const positionsQuery = useJobPositionOptions(clientId, userId);
  const workplacesQuery = useListWorkplaces(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListWorkplacesQueryKey(clientId), userId] },
  });
  const proposal = detail.employees!.proposal as Proposal;
  const positions = useMemo(() => positionsQuery.data?.items ?? [], [positionsQuery.data]);
  const workplaces = useMemo(() => workplacesQuery.data?.items ?? [], [workplacesQuery.data]);
  const context: ReviewContext = useMemo(
    () => ({
      proposal,
      changes: review.changes,
      states: Object.fromEntries(
        proposal.people.map((person) => [
          person.id,
          review.changes.people[person.id]?.state ?? 'to_check',
        ])
      ),
      workplaceCount: workplaces.length,
      today: todayIso(),
    }),
    [proposal, review.changes, workplaces.length]
  );
  return { review, context, positions, workplaces };
}

export const positionName = (positions: Position[], id: string | null | undefined) =>
  positions.find((position) => position.id === id)?.name ?? null;

export const workplaceName = (workplaces: Workplace[], id: string | null | undefined) =>
  workplaces.find((workplace) => workplace.id === id)?.name ?? null;
