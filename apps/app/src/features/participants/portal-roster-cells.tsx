import { formatEmployeeName } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Send } from 'lucide-react';

import { RevokeMenu } from './client-administrator-panel';
import { formatTime } from './participant-format';
import type { AccessTarget } from './portal-access-format';
import type { RosterRow } from './portal-roster-columns';
import type { PortalAccessActions } from './use-portal-access-actions';
import { useTimeReached } from './use-time-reached';

const targetOf = (row: RosterRow): AccessTarget => ({
  name: formatEmployeeName(row),
  address: row.portal.address,
  employeeId: row.id,
});

export function RowActions({
  row,
  readOnly,
  actions,
  onInvite,
}: {
  row: RosterRow;
  readOnly: boolean;
  actions: PortalAccessActions;
  onInvite: (row: RosterRow) => void;
}) {
  const { state, participantId, invitationId, resendableAt } = row.portal;
  const name = formatEmployeeName(row);
  const pending = state === 'invited' || state === 'expired';
  const subject = `lui ${name}`;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {!readOnly && (state === 'none' || state === 'revoked') && (
        <Button
          variant="secondary"
          size="sm"
          data-testid="portal-roster-invite"
          aria-label={`Invită în portal pe ${name}`}
          onClick={() => onInvite(row)}
        >
          <Send aria-hidden="true" />
          Invită
        </Button>
      )}
      {!readOnly && pending && invitationId && (
        <ResendButton
          name={name}
          resendableAt={resendableAt}
          busy={actions.resending === invitationId}
          onResend={() => actions.resend(invitationId, resendableAt, targetOf(row))}
        />
      )}
      {state === 'active' && participantId && (
        <RevokeMenu
          label="Revocă accesul"
          subject={subject}
          onSelect={() => actions.askRevokeAccess(participantId, targetOf(row))}
        />
      )}
      {pending && invitationId && (
        <RevokeMenu
          label="Revocă invitația"
          subject={subject}
          onSelect={() => actions.askRevokeInvitation(invitationId, targetOf(row))}
        />
      )}
    </span>
  );
}

function ResendButton({
  name,
  resendableAt,
  busy,
  onResend,
}: {
  name: string;
  resendableAt: string | null;
  busy: boolean;
  onResend: () => void;
}) {
  const resendable = useTimeReached(resendableAt ?? new Date(0).toISOString());
  return (
    <Button
      variant="secondary"
      size="sm"
      data-testid="portal-roster-resend"
      aria-label={`Retrimite invitația lui ${name}`}
      title={
        resendable || !resendableAt
          ? undefined
          : `Poți retrimite după ora ${formatTime(resendableAt)}.`
      }
      disabled={!resendable || busy}
      onClick={onResend}
    >
      {busy ? 'Se trimite…' : 'Retrimite'}
    </Button>
  );
}
