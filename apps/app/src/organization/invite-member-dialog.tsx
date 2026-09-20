import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getListInvitationsQueryKey,
  useCreateInvitation,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field } from '../components/form-field';
import { inviteFormSchema, type InviteFormValues } from './invite-schema';
import { roleLabels } from './labels';

// The API words conflicts with a `reason`; these two belong next to the email field.
const emailReasons: Record<string, string> = {
  already_member: 'Această adresă aparține deja unui membru al organizației.',
  sent_recently:
    'Am trimis deja o invitație la această adresă în ultimele 10 minute. Încearcă mai târziu.',
};

function serverMessage(cause: unknown) {
  if (cause instanceof ApiHttpError) {
    const body = cause.body as Partial<ApiErrorResponse> | undefined;
    if (body?.reason === 'too_many_open_invitations') {
      return 'Organizația are deja 20 de invitații în așteptare. Revocă una înainte de a trimite alta.';
    }
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
    if (cause.status === 403) return 'Doar administratorii organizației pot trimite invitații.';
    if (cause.status === 503) {
      return 'Invitația nu a putut fi trimisă pe email. Încearcă din nou în câteva momente.';
    }
  }
  return 'Nu am putut trimite invitația. Verifică conexiunea și încearcă din nou.';
}

export function InviteMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Mounted per opening, so a reopened dialog starts empty. */}
      {open && <InviteForm onClose={onClose} />}
    </Dialog>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateInvitation({ request: apiRequest });
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '', role: 'specialist' },
  });
  const { errors } = form.formState;
  const busy = create.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const invitation = await create.mutateAsync({ data: values });
      await queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
      toast.success(`Invitația a fost trimisă la ${invitation.email}.`);
      onClose();
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
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
    <DialogContent data-testid="invite-dialog" className="sm:max-w-md">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
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
            hint="Specialiștii lucrează cu clienții și angajații. Administratorii pot, în plus, să invite alți membri."
            error={errors.role}
          >
            <NativeSelect
              id="invite-role"
              data-testid="invite-role"
              disabled={busy}
              aria-describedby="invite-role-hint"
              className="w-full"
              {...form.register('role')}
            >
              <NativeSelectOption value="specialist">{roleLabels.specialist}</NativeSelectOption>
              <NativeSelectOption value="owner">{roleLabels.owner}</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        {errors.root?.server && (
          <p
            data-testid="invite-error"
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {errors.root.server.message}
          </p>
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
