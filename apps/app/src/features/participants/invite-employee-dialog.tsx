import type { ParticipantChannel } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { useInviteEmployeeParticipant } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import type { ParticipantMessage } from './participant-actions';
import { participantFailure } from './participant-errors';
import { channelLabels } from './participant-format';
import { useRefreshParticipants } from './use-refresh-participants';

export interface InvitedEmployee {
  id: string;
  clientId: string;
  email: string | null;
  phone: string | null;
}

export function InviteEmployeeDialog({
  employee,
  open,
  onClose,
  onMessage,
}: {
  employee: InvitedEmployee;
  open: boolean;
  onClose: () => void;
  onMessage: (message: ParticipantMessage) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Mounted per opening, so a reopened dialog starts with no address picked. */}
      {open && <InviteEmployeeForm employee={employee} onClose={onClose} onMessage={onMessage} />}
    </Dialog>
  );
}

function InviteEmployeeForm({
  employee,
  onClose,
  onMessage,
}: {
  employee: InvitedEmployee;
  onClose: () => void;
  onMessage: (message: ParticipantMessage) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const invite = useInviteEmployeeParticipant({ request: apiRequest });
  const refresh = useRefreshParticipants(employee.clientId);
  const options = (
    [
      ['email', employee.email],
      ['sms', employee.phone],
    ] as const
  ).flatMap(([channel, address]) => (address ? [{ channel, address }] : []));
  // ADR 022: with both addresses the member picks; neither is proposed first.
  const [channel, setChannel] = useState<ParticipantChannel | null>(
    options.length === 1 ? options[0]!.channel : null
  );
  const [error, setError] = useState<string | null>(null);
  const [unpicked, setUnpicked] = useState(false);
  const busy = invite.isPending;

  async function send() {
    const picked = options.find((option) => option.channel === channel);
    if (!picked) {
      setUnpicked(true);
      return;
    }
    setError(null);
    onMessage(null);
    try {
      await invite.mutateAsync({
        clientId: employee.clientId,
        employeeId: employee.id,
        data: picked,
      });
      toast.success(`Invitația a fost trimisă pe ${picked.address}.`);
      onClose();
    } catch (cause) {
      const failure = participantFailure(cause);
      if (failure.saved) {
        onMessage({ variant: 'warning', text: failure.message });
        onClose();
      } else {
        setError(failure.message);
      }
    }
    await refresh(employee.id);
  }

  return (
    <DialogContent data-testid="participant-invite-dialog" className="sm:max-w-md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        aria-busy={busy}
        noValidate
      >
        <DialogHeader>
          <DialogTitle>Invită în portal</DialogTitle>
          <DialogDescription>
            Trimitem adresa portalului. Angajatul intră cu un cod primit la aceeași adresă, fără
            parolă, și își vede instruirile, fișele și datele. Invitația este valabilă 30 de zile.
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <Notice
            variant="info"
            data-testid="participant-invite-no-address"
            className="mt-5"
            action={
              <Button asChild variant="outline" size="sm">
                <Link
                  to="/clients/$clientId/employees/$employeeId/edit"
                  params={{ clientId: employee.clientId, employeeId: employee.id }}
                >
                  Modifică datele
                </Link>
              </Button>
            }
          >
            Angajatul nu are email sau telefon. Adaugă unul în datele lui, apoi trimite invitația.
          </Notice>
        ) : (
          <fieldset
            className="mt-5 grid gap-2"
            aria-describedby={unpicked && !channel ? 'participant-invite-channel-error' : undefined}
          >
            <legend className="mb-2 text-sm font-medium">Trimite invitația pe</legend>
            {options.map((option) => (
              <label
                key={option.channel}
                data-testid="participant-invite-option"
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted/50"
              >
                <input
                  type="radio"
                  name="participant-invite-channel"
                  value={option.channel}
                  checked={channel === option.channel}
                  disabled={busy}
                  onChange={() => setChannel(option.channel)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-medium break-all">{option.address}</span>
                  <span className="text-muted-foreground">
                    {option.channel === 'email' ? 'Email' : channelLabels.sms}
                  </span>
                </span>
              </label>
            ))}
            {unpicked && !channel && (
              <p
                id="participant-invite-channel-error"
                role="alert"
                className="text-sm text-destructive"
              >
                Alege adresa la care trimitem invitația.
              </p>
            )}
          </fieldset>
        )}
        {error && (
          <Notice variant="destructive" data-testid="participant-invite-error" className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          {options.length > 0 && (
            <Button type="submit" data-testid="participant-invite-submit" disabled={busy}>
              {busy ? 'Se trimite…' : 'Trimite invitația'}
            </Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
