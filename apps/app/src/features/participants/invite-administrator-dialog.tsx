import { zodResolver } from '@hookform/resolvers/zod';
import { formatEmployeeName } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { useInviteClientAdministrator } from '@/api/generated/api';
import { Field, FieldMessage } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import type { Client } from '@/features/clients/client-form-schema';
import { EmployeeCombobox } from '@/features/training/employee-combobox';

import {
  administratorInviteFormSchema,
  type AdministratorInviteFormValues,
} from './administrator-invite-schema';
import type { ParticipantMessage } from './participant-actions';
import { participantFailure } from './participant-errors';
import { useRefreshParticipants } from './use-refresh-participants';

export function InviteAdministratorDialog({
  client,
  userId,
  open,
  onClose,
  onMessage,
}: {
  client: Client;
  userId: string;
  open: boolean;
  onClose: () => void;
  onMessage: (message: ParticipantMessage) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Mounted per opening, so a reopened dialog starts from the client's proposals. */}
      {open && (
        <InviteAdministratorForm
          client={client}
          userId={userId}
          onClose={onClose}
          onMessage={onMessage}
        />
      )}
    </Dialog>
  );
}

const channelOptions = [
  { channel: 'email', label: 'Email' },
  { channel: 'sms', label: 'SMS' },
] as const;

function InviteAdministratorForm({
  client,
  userId,
  onClose,
  onMessage,
}: {
  client: Client;
  userId: string;
  onClose: () => void;
  onMessage: (message: ParticipantMessage) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const invite = useInviteClientAdministrator({ request: apiRequest });
  const refresh = useRefreshParticipants(client.id);
  const form = useForm<AdministratorInviteFormValues>({
    resolver: zodResolver(administratorInviteFormSchema),
    defaultValues: {
      isEmployee: false,
      employeeId: '',
      fullName: client.legalRepresentativeName ?? client.contactName ?? '',
      // Neither channel is proposed first (ADR 022), even when the client has both.
      channel: '',
      email: client.contactEmail ?? '',
      phone: client.contactPhone ?? '',
    },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const isEmployee = useWatch({ control: form.control, name: 'isEmployee' });
  const channel = useWatch({ control: form.control, name: 'channel' });
  const busy = invite.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const address = values.channel === 'sms' ? values.phone : values.email;
    onMessage(null);
    try {
      await invite.mutateAsync({
        clientId: client.id,
        data: {
          channel: values.channel === 'sms' ? 'sms' : 'email',
          address,
          ...(values.isEmployee
            ? { employeeId: values.employeeId }
            : { fullName: values.fullName }),
        },
      });
      toast.success(`Invitația a fost trimisă pe ${address}.`);
      onClose();
    } catch (cause) {
      const failure = participantFailure(cause);
      if (failure.saved) {
        onMessage({ variant: 'warning', text: failure.message });
        onClose();
      } else if (failure.aboutAddress) {
        form.setError(values.channel === 'sms' ? 'phone' : 'email', { message: failure.message });
      } else {
        form.setError('root.server', { message: failure.message });
      }
    }
    await refresh(values.isEmployee ? values.employeeId : null);
  });

  return (
    <DialogContent data-testid="administrator-invite-dialog" className="sm:max-w-lg">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Invită administratorul clientului</DialogTitle>
          <DialogDescription>
            Administratorul clientului vede în portal angajații, stadiul instruirilor și fișele lor.
            Intră cu un cod primit la adresa de mai jos, fără parolă. Invitația este valabilă 30 de
            zile.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="isEmployee"
              render={({ field }) => (
                <Checkbox
                  id="administrator-is-employee"
                  data-testid="administrator-is-employee"
                  checked={field.value}
                  disabled={busy}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <label htmlFor="administrator-is-employee" className="text-sm font-medium">
              Este angajat al clientului
            </label>
          </div>
          {isEmployee ? (
            <Field
              id="administrator-employee"
              label="Angajatul"
              mark="required"
              error={errors.employeeId}
            >
              <Controller
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <EmployeeCombobox
                    id="administrator-employee"
                    clientId={client.id}
                    userId={userId}
                    value={field.value}
                    disabled={busy}
                    invalid={Boolean(errors.employeeId)}
                    describedBy={errors.employeeId ? 'administrator-employee-error' : undefined}
                    onSelect={(employee) => {
                      field.onChange(employee?.id ?? '');
                      form.clearErrors('employeeId');
                      if (!employee) return;
                      const fill = { shouldDirty: true };
                      form.setValue('fullName', formatEmployeeName(employee), fill);
                      if (employee.email) form.setValue('email', employee.email, fill);
                      if (employee.phone) form.setValue('phone', employee.phone, fill);
                    }}
                  />
                )}
              />
            </Field>
          ) : (
            <Field
              id="administrator-name"
              label="Nume și prenume"
              mark="required"
              error={errors.fullName}
            >
              <Input
                id="administrator-name"
                data-testid="administrator-name"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? 'administrator-name-error' : undefined}
                {...form.register('fullName')}
              />
            </Field>
          )}
          <fieldset
            className="grid gap-2"
            aria-describedby={errors.channel ? 'administrator-channel-error' : undefined}
          >
            <legend className="mb-2 flex items-center gap-1 text-sm font-medium">
              Trimite invitația prin
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
              <span className="sr-only">(obligatoriu)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {channelOptions.map((option) => (
                <label
                  key={option.channel}
                  data-testid="administrator-channel-option"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-muted/50"
                >
                  <input
                    type="radio"
                    value={option.channel}
                    disabled={busy}
                    aria-invalid={Boolean(errors.channel)}
                    className="size-4 shrink-0 accent-primary"
                    {...form.register('channel')}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <FieldMessage id="administrator-channel-error" error={errors.channel} />
          </fieldset>
          {channel === 'email' && (
            <Field
              id="administrator-email"
              label="Adresa de email"
              mark="required"
              error={errors.email}
            >
              <Input
                id="administrator-email"
                data-testid="administrator-email"
                type="email"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'administrator-email-error' : undefined}
                {...form.register('email')}
              />
            </Field>
          )}
          {channel === 'sms' && (
            <Field
              id="administrator-phone"
              label="Numărul de telefon"
              mark="required"
              error={errors.phone}
            >
              <Input
                id="administrator-phone"
                data-testid="administrator-phone"
                type="tel"
                autoComplete="off"
                placeholder="07xx xxx xxx"
                disabled={busy}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? 'administrator-phone-error' : undefined}
                {...form.register('phone')}
              />
            </Field>
          )}
        </div>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="administrator-invite-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="administrator-invite-submit" disabled={busy}>
            {busy ? 'Se trimite…' : 'Trimite invitația'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
