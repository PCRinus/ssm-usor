import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { toast } from '@ssm-usor/ui/lib/toast';
import { createFileRoute, useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { profileFormSchema, type ProfileFormValues } from '../../account/profile-schema';
import { useMe } from '../../account/use-me';
import { getGetMeQueryKey, type MeResponse, useUpdateProfile } from '../../api/generated/api';
import { ApiHttpError } from '../../api/http';
import { Field } from '../../components/form-field';
import { roleLabels } from '../../organization/labels';

export const Route = createFileRoute('/_authenticated/profile')({
  staticData: { title: 'Profilul meu' },
  component: ProfilePage,
});

export function ProfilePage() {
  const me = useMe();

  if (me.isPending) {
    return (
      <p role="status" data-testid="profile-loading">
        Se încarcă profilul…
      </p>
    );
  }
  if (me.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        <p>Nu am putut încărca profilul.</p>
        <Button variant="outline" disabled={me.isFetching} onClick={() => void me.refetch()}>
          Încearcă din nou
        </Button>
      </div>
    );
  }

  // Keyed by the saved name, so the form starts again from what the server holds.
  return <ProfileForm key={me.data.profile?.fullName ?? ''} me={me.data} />;
}

function ProfileForm({ me }: { me: MeResponse }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateProfile({ request: apiRequest });
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { fullName: me.profile?.fullName ?? '' },
  });
  const { errors, isDirty } = form.formState;
  const busy = update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ data: values });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success('Profilul a fost salvat.');
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 401
            ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
            : 'Nu am putut salva profilul. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <div data-testid="profile-page" className="grid max-w-2xl gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Profilul meu</h1>
        <p className="mt-3 text-muted-foreground">
          Numele tău apare în lista de membri și în invitațiile pe care le trimiți.
        </p>
      </div>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Date personale</h2>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void onSubmit(event)}
            aria-busy={busy}
            noValidate
            className="grid gap-5"
          >
            <Field id="profile-full-name" label="Nume și prenume" error={errors.fullName}>
              <Input
                id="profile-full-name"
                data-testid="profile-full-name"
                autoComplete="name"
                disabled={busy}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? 'profile-full-name-error' : undefined}
                {...form.register('fullName')}
              />
            </Field>
            <Field
              id="profile-email"
              label="Adresa de email"
              hint="Cu această adresă te autentifici. Deocamdată nu poate fi schimbată din aplicație."
            >
              <Input
                id="profile-email"
                data-testid="profile-email"
                value={me.user.email ?? ''}
                readOnly
                aria-describedby="profile-email-hint"
                className="bg-muted"
              />
            </Field>
            {errors.root?.server && (
              <p
                data-testid="profile-error"
                role="alert"
                className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
              >
                {errors.root.server.message}
              </p>
            )}
            <div>
              <Button type="submit" data-testid="profile-save" disabled={busy || !isDirty}>
                {busy ? 'Se salvează…' : 'Salvează'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {me.membership && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Organizație</h2>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{me.membership.organization.name}</p>
            <p className="mt-1 text-muted-foreground">Rol: {roleLabels[me.membership.role]}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
