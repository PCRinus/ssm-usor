import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { toast } from '@ssm-usor/ui/lib/toast';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  type InvitationResponse,
  useResendInvitation,
  useRevokeInvitation,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { wordingRefusalHere } from '@/features/impersonation/refusal';
import { commonFailure } from '@/lib/api-errors';

import { refreshTeam } from './refresh-team';

function actionMessage(cause: unknown, email: string) {
  const common = commonFailure(cause);
  if (common) return common;
  if (cause instanceof ApiHttpError) {
    const reason = apiErrorReason(cause);
    if (reason === 'sent_recently') {
      return `Am trimis deja o invitație la ${email} în ultimele 10 minute. Încearcă mai târziu.`;
    }
    if (reason === 'member_limit_reached') {
      return `Toți utilizatorii planului sunt ocupați, iar invitația pentru ${email} a expirat și nu mai ține un loc. Revocă o invitație în așteptare sau schimbă planul din Abonament.`;
    }
    if (cause.status === 404) return `Invitația pentru ${email} nu mai este în așteptare.`;
    if (cause.status === 503) {
      return 'Invitația nu a putut fi trimisă pe email. Încearcă din nou în câteva momente.';
    }
  }
  return 'Acțiunea nu a reușit. Verifică conexiunea și încearcă din nou.';
}

// `onError` reports to the card, where the message persists.
export function InvitationActions({
  invitation,
  onError,
}: {
  invitation: InvitationResponse;
  onError: (message: ReactNode) => void;
}) {
  const { request, queryClient } = useApi();
  const resend = useResendInvitation({ request: wordingRefusalHere(request) });
  const revoke = useRevokeInvitation({ request });
  const busy = resend.isPending || revoke.isPending;
  const { email } = invitation;

  async function run(action: 'resend' | 'revoke') {
    onError(null);
    try {
      if (action === 'resend') {
        await resend.mutateAsync({ invitationId: invitation.id });
        toast.success(`Am retrimis invitația la ${email}.`);
      } else {
        await revoke.mutateAsync({ invitationId: invitation.id });
        toast.success(`Invitația pentru ${email} a fost revocată.`);
      }
    } catch (cause) {
      onError(actionMessage(cause, email));
    }
    // Also after a failure: a 404 means the list on screen is out of date.
    await refreshTeam(queryClient);
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="secondary"
        size="sm"
        data-testid="invitation-resend"
        aria-label={`Retrimite invitația la ${email}`}
        disabled={busy}
        onClick={() => void run('resend')}
      >
        Retrimite
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="invitation-actions"
            aria-label={`Acțiuni pentru invitația trimisă la ${email}`}
            disabled={busy}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            data-testid="invitation-revoke"
            variant="destructive"
            onSelect={() => void run('revoke')}
          >
            Revocă invitația
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
