import { zodResolver } from '@hookform/resolvers/zod';
import { billingPlans } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { useCreateInvitation } from '@/api/generated/api';
import { apiErrorBody, apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { replayShow } from '@/app/observability/replay-masking';
import { openedHere } from '@/app/opener';
import { useHoldOpen } from '@/components/close-guard';
import { FormDialog } from '@/components/form-dialog';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { wordingRefusalHere } from '@/features/impersonation/refusal';
import { type MemberSeats, upgradeSearch, userNoun } from '@/features/subscription/member-seats';
import { contactEmail } from '@/features/subscription/subscription-copy';
import { commonFailure } from '@/lib/api-errors';

import { inviteFormSchema, type InviteFormValues } from './invite-schema';
import { roleLabels } from './labels';
import { refreshTeam } from './refresh-team';

// The API words conflicts with a `reason`; these two belong next to the email field.
const emailReasons: Record<string, string> = {
  already_member: 'Această adresă aparține deja unui membru al organizației.',
  sent_recently:
    'Am trimis deja o invitație la această adresă în ultimele 10 minute. Încearcă mai târziu.',
};

function serverMessage(cause: unknown) {
  const common = commonFailure(cause);
  if (common) return common;
  if (cause instanceof ApiHttpError) {
    const reason = apiErrorReason(cause);
    if (reason === 'member_limit_reached') {
      return 'Toți utilizatorii planului sunt ocupați de membri sau de invitații în așteptare. Poți revoca o invitație. Pe Start, treci pe Profesional din Abonament; peste 10 utilizatori, scrie-ne la contact@ssmusor.ro pentru o ofertă.';
    }
    if (reason === 'too_many_open_invitations') {
      return 'Organizația are deja 20 de invitații în așteptare. Revocă una înainte de a trimite alta.';
    }
    if (cause.status === 403) return 'Doar adminii organizației pot trimite invitații.';
    if (cause.status === 503) {
      return 'Invitația nu a putut fi trimisă pe email. Încearcă din nou în câteva momente.';
    }
  }
  return 'Nu am putut trimite invitația. Verifică conexiunea și încearcă din nou.';
}

export function InviteMemberDialog({
  open,
  seats,
  onClose,
}: {
  open: boolean;
  seats: MemberSeats | null;
  onClose: () => void;
}) {
  return (
    <FormDialog open={open} onClose={onClose}>
      {/* Mounted per opening, so a reopened dialog starts empty. */}
      {open &&
        (seats?.full ? (
          <PlanFull seats={seats} onClose={onClose} />
        ) : (
          <InviteForm onClose={onClose} />
        ))}
    </FormDialog>
  );
}

// Before an address is typed: the API would refuse any new one.
function PlanFull({ seats, onClose }: { seats: MemberSeats; onClose: () => void }) {
  return (
    <DialogContent data-testid="invite-dialog" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Invită un membru</DialogTitle>
        <DialogDescription data-testid="invite-plan-full">
          Planul are {userNoun(seats.limit ?? seats.taken)} și toți sunt ocupați de membri sau de
          invitații în așteptare.{' '}
          {seats.upgrade
            ? `Pentru un coleg nou, treci pe Profesional, care are ${billingPlans.profesional.members}, sau revocă o invitație în așteptare.`
            : `Poți revoca o invitație în așteptare. Pentru mai mulți utilizatori, scrie-ne la ${contactEmail}.`}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="mt-6">
        <Button type="button" variant="ghost" onClick={onClose}>
          {seats.upgrade ? 'Renunță' : 'Închide'}
        </Button>
        {seats.upgrade && (
          <Button asChild data-testid="invite-upgrade">
            <Link to="/organizatie/abonament/alege" state={openedHere} search={upgradeSearch}>
              Treci pe Profesional
            </Link>
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const { request, queryClient } = useApi();
  const create = useCreateInvitation({ request: wordingRefusalHere(request) });
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '', role: 'specialist' },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = create.isPending;
  useHoldOpen(busy);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const invitation = await create.mutateAsync({ data: values });
      await refreshTeam(queryClient);
      toast.success(`Invitația a fost trimisă la ${invitation.email}.`);
      onClose();
    } catch (cause) {
      const body = apiErrorBody(cause);
      const emailMessage =
        (body?.reason && emailReasons[body.reason]) ||
        (body?.issues?.some((issue) => issue.path === 'email')
          ? 'Adresa de email nu este validă.'
          : undefined);
      if (emailMessage) form.setError('email', { message: emailMessage });
      else form.setError('root.server', { message: serverMessage(cause) });
    }
  });

  return (
    <DialogContent data-testid="invite-dialog" className="sm:max-w-md" showCloseButton={!busy}>
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Invită un membru</DialogTitle>
          <DialogDescription>
            Trimitem pe email un link valabil 7 zile. Persoana își creează contul sau, dacă are deja
            unul, intră cu el în organizație.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field id="invite-email" label="Adresa de email" mark="required" error={errors.email}>
            <Input
              id="invite-email"
              data-testid="invite-email"
              type="email"
              autoComplete="off"
              placeholder="nume@firma.ro"
              disabled={busy}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'invite-email-error' : undefined}
              {...form.register('email')}
            />
          </Field>
          <Field
            id="invite-role"
            label="Rol"
            mark="required"
            help="organizatie.roluri"
            error={errors.role}
          >
            <NativeSelect
              id="invite-role"
              data-testid="invite-role"
              {...replayShow}
              disabled={busy}
              {...form.register('role')}
            >
              <NativeSelectOption value="specialist">{roleLabels.specialist}</NativeSelectOption>
              <NativeSelectOption value="owner">{roleLabels.owner}</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="invite-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="invite-submit" disabled={busy}>
            {busy ? 'Se trimite…' : 'Trimite invitația'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
