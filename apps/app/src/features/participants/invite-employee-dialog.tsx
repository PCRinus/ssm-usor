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
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import type { ParticipantMessage } from './participant-actions';
import { participantFailure } from './participant-errors';
import { channelLabels } from './participant-format';
import {
  foreignNumberLabel,
  smsBlockLabels,
  smsBlockOf,
  trialSmsNotice,
  useSmsOff,
} from './sms-rules';
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
      {/* Mounted per opening, so a reopened dialog starts again from the proposed address. */}
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
  const smsOff = useSmsOff();
  const smsBlock = employee.phone ? smsBlockOf(employee.phone, smsOff) : null;
  const options = (
    [
      ['email', employee.email, null],
      ['sms', employee.phone, smsBlock],
    ] as const
  ).flatMap(([channel, address, blocked]) => (address ? [{ channel, address, blocked }] : []));
  const sendable = options.filter((option) => !option.blocked);
  // ADR 023: email first, since every signing code sent by SMS is paid for.
  const [channel, setChannel] = useState<ParticipantChannel | null>(sendable[0]?.channel ?? null);
  const [error, setError] = useState<string | null>(null);
  const busy = invite.isPending;

  async function send() {
    const picked = sendable.find((option) => option.channel === channel);
    if (!picked) return;
    setError(null);
    onMessage(null);
    try {
      await invite.mutateAsync({
        clientId: employee.clientId,
        employeeId: employee.id,
        data: { channel: picked.channel, address: picked.address },
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
            parolă, și își vede instruirile, fișele și datele. Invitația este valabilă 30 de zile.{' '}
            <HelpLink topic="angajati.invitatie">Află mai mult</HelpLink>
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
            Angajatul nu are email sau telefon. Adaugă unul în datele lui, apoi trimite invitația.{' '}
            <HelpLink topic="angajati.invitatie-fara-adresa">De ce?</HelpLink>
          </Notice>
        ) : (
          <>
            <fieldset className="mt-5 grid gap-2">
              <legend className="mb-2 text-sm font-medium">Trimite invitația pe</legend>
              {options.map((option) => (
                <label
                  key={option.channel}
                  data-testid="participant-invite-option"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted/50 has-disabled:cursor-not-allowed has-disabled:text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="participant-invite-channel"
                    value={option.channel}
                    checked={channel === option.channel}
                    disabled={busy || Boolean(option.blocked)}
                    onChange={() => setChannel(option.channel)}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-medium break-all">{option.address}</span>
                    {option.blocked ? (
                      <span
                        data-testid="participant-invite-blocked"
                        className="text-warning-foreground"
                      >
                        {smsBlockLabels[option.blocked]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {option.channel === 'email' ? 'Email' : channelLabels.sms}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
            {smsBlock && (smsBlock === 'trial' || sendable.length === 0) && (
              <Notice
                variant="info"
                data-testid="participant-invite-sms-notice"
                className="mt-4"
                action={
                  sendable.length === 0 && (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to="/clients/$clientId/employees/$employeeId/edit"
                        params={{ clientId: employee.clientId, employeeId: employee.id }}
                      >
                        Modifică datele
                      </Link>
                    </Button>
                  )
                }
              >
                {smsBlock === 'foreign'
                  ? `Angajatul are doar ${foreignNumberLabel(employee.phone ?? '')}, iar SMS trimitem doar spre numere din România. Adaugă-i o adresă de email, apoi trimite invitația.`
                  : sendable.length > 0
                    ? trialSmsNotice
                    : 'În perioada de probă nu trimitem SMS, iar angajatul are doar un număr de telefon. Adaugă-i o adresă de email, apoi trimite invitația.'}
              </Notice>
            )}
          </>
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
          {sendable.length > 0 && (
            <Button type="submit" data-testid="participant-invite-submit" disabled={busy}>
              {busy ? 'Se trimite…' : 'Trimite invitația'}
            </Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
