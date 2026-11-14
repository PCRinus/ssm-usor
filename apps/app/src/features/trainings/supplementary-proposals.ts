import { type TrainingDomain, trainingDomainLabels } from '@ssm-usor/contracts';
import { useRouteContext } from '@tanstack/react-router';

import {
  getListSupplementaryTrainingProposalsQueryKey,
  type SupplementaryTrainingProposalListResponseItemsItem as Proposal,
  type SupplementaryTrainingProposalListResponseItemsItemPostsItem as ProposalPost,
  useListSupplementaryTrainingProposals,
} from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';
import { formatRoDate } from '@/lib/dates';

import type { ProposedTraining } from './training-dialog';

export type { Proposal, ProposalPost };

export const countOf = (count: number, one: string, many: string) =>
  count === 1 ? `un ${one}` : roCount(count, one, many);

export const proposalLead: Record<TrainingDomain, string> = {
  ssm: 'Dacă s-a schimbat ceva din conținut, lucrătorii trebuie instruiți din ele: o instruire periodică suplimentară (HG 1425/2006, art. 98 lit. b)).',
  // OMAI 712/2005 has no such rule; Mircea chose to propose it anyway (ADR 042), so no law is cited.
  su: 'Dacă s-a schimbat ceva din conținut, e bine ca lucrătorii să fie instruiți din ele.',
};

export function proposalTitle(proposal: Pick<Proposal, 'domain' | 'firstIssue'>) {
  const issued = proposal.firstIssue ? 'au fost emise' : 'au fost emise din nou';
  return `Instrucțiunile proprii ${trainingDomainLabels[proposal.domain]} ${issued}`;
}

export function proposalMaterial(
  proposal: Pick<Proposal, 'documentTitle' | 'revision' | 'documentDate'>
) {
  return `${proposal.documentTitle}, rev. ${proposal.revision} din ${formatRoDate(proposal.documentDate)}`;
}

export function proposedTraining(proposal: Proposal, post: ProposalPost): ProposedTraining {
  return {
    key: `${proposal.revisionId}:${post.jobPositionId}`,
    jobPositionId: post.jobPositionId,
    material: proposalMaterial(proposal),
    number: proposal.posts.indexOf(post) + 1,
    total: proposal.posts.length,
    next: proposal.posts
      .filter((other) => other !== post && other.recordedOn === null)
      .map((other) => other.name),
  };
}

export function useSupplementaryTrainingProposals(
  clientId: string,
  userId: string,
  enabled = true
) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useListSupplementaryTrainingProposals(clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getListSupplementaryTrainingProposalsQueryKey(clientId), userId],
      enabled: enabled && Boolean(userId && apiRequest.baseUrl),
    },
  });
}

// The focused link goes with the closed notice; a heading of the page takes the focus instead of
// the document body, so a keyboard or screen reader user stays where they were.
export function focusHeadingIn(page: HTMLElement | null) {
  const heading = page?.querySelector<HTMLElement>('h2, h3');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
}
