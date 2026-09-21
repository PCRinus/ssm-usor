import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';

import {
  getGetOrganizationAuthorizationsQueryKey,
  type OrganizationAuthorizationsResponse,
  useGetOrganizationAuthorizations,
  useUpdateOrganizationAuthorizations,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { DatePicker } from '../components/date-picker';
import { Field } from '../components/form-field';
import { FormSection } from '../components/form-section';
import { Notice } from '../components/notice';
import { todayIso } from '../employees/employee-format';
import {
  authorizationsFormSchema,
  type AuthorizationsFormValues,
  toAuthorizationsForm,
  toAuthorizationsRequest,
} from './authorizations-schema';

type Authorizations = OrganizationAuthorizationsResponse['authorizations'];

// Hiding the owner's form controls is a courtesy; the API and the database enforce the rule.
export function AuthorizationsCard({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const saved = useGetOrganizationAuthorizations({
    request: apiRequest,
    query: { queryKey: [...getGetOrganizationAuthorizationsQueryKey(), userId] },
  });

  return (
    <div data-testid="authorizations-card" className="grid gap-5">
      {canEdit && (
        <Notice variant="info">
          Poți salva abilitările pe rând. Îți vom cere datele necesare când generezi un contract.
        </Notice>
      )}
      {saved.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : saved.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={saved.isFetching}
              onClick={() => void saved.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca abilitările.
        </Notice>
      ) : (
        // Keyed by what is saved, so the form starts again from what the server holds.
        <AuthorizationsForm
          key={JSON.stringify(saved.data.authorizations)}
          saved={saved.data.authorizations}
          userId={userId}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

type TextField = Exclude<keyof AuthorizationsFormValues, 'authorizationCertificateDate'>;

function AuthorizationsForm({
  saved,
  userId,
  canEdit,
}: {
  saved: Authorizations;
  userId: string;
  canEdit: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateOrganizationAuthorizations({ request: apiRequest });
  const form = useForm<AuthorizationsFormValues>({
    resolver: zodResolver(authorizationsFormSchema),
    defaultValues: toAuthorizationsForm(saved),
  });
  const { errors, isDirty } = form.formState;
  const busy = update.isPending;
  const locked = busy || !canEdit;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ data: toAuthorizationsRequest(values) });
      await queryClient.invalidateQueries({
        queryKey: [...getGetOrganizationAuthorizationsQueryKey(), userId],
      });
      toast.success('Abilitările au fost salvate.');
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 403
            ? 'Doar administratorii organizației pot modifica abilitările.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva abilitările. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  const text = (
    name: TextField,
    label: string,
    options: { hint?: string; className?: string } = {}
  ) => {
    const id = `authorizations-${name}`;
    return (
      <Field
        id={id}
        label={label}
        hint={options.hint}
        error={errors[name]}
        className={options.className}
      >
        <Input
          id={id}
          data-testid={id}
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-error` : options.hint ? `${id}-hint` : undefined}
          {...form.register(name)}
        />
      </Field>
    );
  };

  return (
    <form
      data-testid="authorizations-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-6"
    >
      <Card className="gap-0 divide-y py-0">
        <FormSection
          title="Certificat de abilitare SSM"
          description="Numărul și emitentul care vor apărea în contract."
        >
          {text('authorizationCertificateNumber', 'Număr')}
          <Field
            id="authorizations-authorizationCertificateDate"
            label="Data emiterii"
            error={errors.authorizationCertificateDate}
          >
            <Controller
              control={form.control}
              name="authorizationCertificateDate"
              render={({ field }) => (
                <DatePicker
                  id="authorizations-authorizationCertificateDate"
                  testId="authorizations-authorizationCertificateDate"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  max={todayIso()}
                  disabled={locked}
                  invalid={Boolean(errors.authorizationCertificateDate)}
                />
              )}
            />
          </Field>
          {text('authorizationCertificateIssuer', 'Emis de', {
            hint: 'De exemplu „Ministerul Muncii – Direcția de muncă și protecție socială Timiș”.',
            className: 'sm:col-span-2',
          })}
        </FormSection>

        <FormSection
          title="Cadru tehnic PSI"
          description="Completează doar dacă oferi și servicii de apărare împotriva incendiilor."
        >
          {text('fireSafetyTechnicianName', 'Nume și prenume')}
          {text('fireSafetyTechnicianCertificate', 'Certificat', {
            hint: 'Seria și numărul certificatului de cadru tehnic.',
          })}
        </FormSection>
      </Card>

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="authorizations-error">
          {errors.root.server.message}
        </Notice>
      )}
      {canEdit && (
        <div>
          <Button type="submit" data-testid="authorizations-save" disabled={busy || !isDirty}>
            {update.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </div>
      )}
    </form>
  );
}
