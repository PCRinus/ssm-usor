import type { TrainingDomain } from '@ssm-usor/contracts';
import { Alert, AlertDescription, AlertTitle } from '@ssm-usor/ui/components/alert';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { Check, Info, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import {
  getListSupplementaryTrainingProposalsQueryKey,
  useDismissSupplementaryTrainingProposal,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { HelpLink } from '@/components/help-link';
import { roCount } from '@/features/employees/employee-format';
import { formatRoDate } from '@/lib/dates';

import {
  countOf,
  type Proposal,
  proposalLead,
  type ProposalPost,
  proposalTitle,
  proposedTraining,
  useSupplementaryTrainingProposals,
} from './supplementary-proposals';
import { TrainingDialog, type TrainingDialogTarget } from './training-dialog';

const shownPosts = 5;

export function SupplementaryTrainingProposals({
  clientId,
  userId,
  domain,
  readOnly,
}: {
  clientId: string;
  userId: string;
  domain?: TrainingDomain;
  readOnly: boolean;
}) {
  const proposals = useSupplementaryTrainingProposals(clientId, userId, !readOnly);
  const [target, setTarget] = useState<TrainingDialogTarget | null>(null);
  const shown = (proposals.data?.items ?? []).filter(
    (proposal) => domain === undefined || proposal.domain === domain
  );
  if (readOnly || shown.length === 0) return null;
  return (
    <>
      {shown.map((proposal) => (
        <ProposalNotice
          key={proposal.revisionId}
          clientId={clientId}
          proposal={proposal}
          onRecord={(post) =>
            setTarget({
              kind: 'new',
              domain: proposal.domain,
              phase: 'supplementary',
              proposed: proposedTraining(proposal, post),
            })
          }
        />
      ))}
      <TrainingDialog
        clientId={clientId}
        userId={userId}
        target={target}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

function ProposalNotice({
  clientId,
  proposal,
  onRecord,
}: {
  clientId: string;
  proposal: Proposal;
  onRecord: (post: ProposalPost) => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const dismiss = useDismissSupplementaryTrainingProposal({ request: apiRequest });
  const [unfolded, setUnfolded] = useState(false);
  const ssm = proposal.domain === 'ssm';
  const Icon = ssm ? TriangleAlert : Info;
  const posts = unfolded ? proposal.posts : proposal.posts.slice(0, shownPosts);
  const folded = proposal.posts.length - shownPosts;
  const workers = proposal.posts.reduce((sum, post) => sum + post.workerCount, 0);
  const titleId = `training-proposal-${proposal.revisionId}`;

  async function close() {
    try {
      await dismiss.mutateAsync({ clientId, revisionId: proposal.revisionId });
      toast.success('Nota a fost închisă. Nu se înregistrează nicio instruire.');
    } catch (cause) {
      // Closed elsewhere in the meantime: the list below catches up.
      if (!(cause instanceof ApiHttpError && cause.status === 404)) {
        toast.error('Nu am putut închide nota. Verifică conexiunea și încearcă din nou.');
        return;
      }
    }
    await queryClient.invalidateQueries({
      queryKey: getListSupplementaryTrainingProposalsQueryKey(clientId),
    });
  }

  return (
    <Alert
      variant={ssm ? 'warning' : 'info'}
      role="status"
      aria-labelledby={titleId}
      data-testid="training-proposal"
      data-domain={proposal.domain}
    >
      <Icon aria-hidden="true" />
      <AlertTitle id={titleId}>{proposalTitle(proposal)}</AlertTitle>
      <AlertDescription className="mt-1 justify-items-stretch gap-2.5">
        <p className="max-w-[84ch]">
          Rev. {proposal.revision}, din{' '}
          <span className="tabular-nums">{formatRoDate(proposal.documentDate)}</span>.{' '}
          {proposalLead[proposal.domain]}{' '}
          <HelpLink topic="angajati.instruire-dupa-emitere" className="text-current">
            Află mai mult
          </HelpLink>
        </p>
        <p className="font-medium" data-testid="training-proposal-summary">
          Câte o instruire pe post · {countOf(proposal.posts.length, 'post', 'posturi')},{' '}
          {countOf(workers, 'lucrător', 'lucrători')}
        </p>
        <ul
          className={cn(
            'overflow-hidden rounded-lg border bg-card text-foreground',
            ssm ? 'border-warning-border' : 'border-info-border'
          )}
          aria-label="Posturile de instruit"
        >
          {posts.map((post) => (
            <li
              key={post.jobPositionId}
              data-testid="training-proposal-post"
              className={cn(
                'grid justify-items-start gap-2 px-3 py-2.5 sm:flex sm:items-center sm:gap-4',
                'border-t first:border-t-0',
                ssm ? 'border-warning-border' : 'border-info-border'
              )}
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-semibold">{post.name}</span>
                <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
                  {countOf(post.workerCount, 'lucrător', 'lucrători')}
                </span>
              </span>
              {post.recordedOn ? (
                <span
                  data-testid="training-proposal-done"
                  className="inline-flex items-center gap-1.5 text-[0.8125rem] whitespace-nowrap text-success-foreground"
                >
                  <Check aria-hidden="true" className="size-4" strokeWidth={2.4} />
                  Înregistrată pe {formatRoDate(post.recordedOn)}
                </span>
              ) : (
                <Button
                  size="sm"
                  data-testid="training-proposal-record"
                  aria-label={`Înregistrează instruirea pentru postul ${post.name}`}
                  onClick={() => onRecord(post)}
                >
                  Înregistrează
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {folded > 0 && (
            <Button
              variant="link"
              data-testid="training-proposal-unfold"
              aria-expanded={unfolded}
              className="h-auto p-0 font-medium text-current underline underline-offset-4"
              onClick={() => setUnfolded((current) => !current)}
            >
              {unfolded
                ? 'Arată mai puține'
                : `Arată toate cele ${roCount(proposal.posts.length, 'post', 'posturi')}`}
            </Button>
          )}
          <Button
            variant="link"
            data-testid="training-proposal-dismiss"
            disabled={dismiss.isPending}
            className="h-auto p-0 font-normal text-current underline underline-offset-4"
            onClick={() => void close()}
          >
            Nu e nevoie de instruire
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
