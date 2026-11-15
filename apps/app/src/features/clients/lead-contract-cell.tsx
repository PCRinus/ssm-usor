import type { ServiceContractState } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';

import { CellBadge } from '@/components/data-table/cell-badge';
import { CellNote } from '@/components/data-table/cell-note';
import { useTimeReached } from '@/features/participants/use-time-reached';
import { formatRoDateOf } from '@/lib/dates';

import type { ClientRow } from './client-columns';
import { contractStateLabels } from './lead-contract-states';

// Amber for Primit: the one state where the owner must act.
const contractStateBadges: Record<
  Exclude<ServiceContractState, 'none'>,
  { variant: 'outline' | 'secondary'; className?: string }
> = {
  draft: { variant: 'secondary' },
  issued: { variant: 'outline' },
  sent: { variant: 'outline' },
  received: {
    variant: 'outline',
    className: 'border-warning-border bg-warning text-warning-foreground',
  },
  signed: {
    variant: 'outline',
    className: 'border-success-border bg-success text-success-foreground',
  },
};

// The client can no longer upload the signed copy, so the owner has to send the contract again.
function ExpiredLink({ expiresAt }: { expiresAt: string }) {
  if (!useTimeReached(expiresAt)) return null;
  return (
    <CellBadge tone="warning" className="ml-1" data-testid="leads-contract-expired">
      Link expirat
    </CellBadge>
  );
}

export function LeadContractCell({ lead }: { lead: ClientRow }) {
  const state = lead.serviceContractState ?? 'none';
  if (state === 'none') {
    return <span data-testid="leads-contract">{contractStateLabels.none}</span>;
  }
  const badge = contractStateBadges[state];
  const at = lead.serviceContractStateAt;
  const expiresAt = lead.serviceContractReturnExpiresAt;
  return (
    <>
      <Badge
        variant={badge.variant}
        className={badge.className}
        data-testid="leads-contract"
        data-state={state}
      >
        {contractStateLabels[state]}
      </Badge>
      {state === 'sent' && expiresAt && <ExpiredLink expiresAt={expiresAt} />}
      {at && (
        <CellNote data-testid="leads-contract-date" className="tabular-nums whitespace-normal">
          {formatRoDateOf(at)}
        </CellNote>
      )}
    </>
  );
}
