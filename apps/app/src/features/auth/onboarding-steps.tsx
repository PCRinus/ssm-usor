import { zodResolver } from '@hookform/resolvers/zod';
import { bankNameAfterIbanChange, bankNameForIban, formatIban } from '@ssm-usor/contracts';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Navigate, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  getGetMeQueryKey,
  getGetOrganizationCompanyDetailsQueryKey,
  type MeResponse,
  type OrganizationCompanyDetailsResponse,
  useGetOrganizationCompanyDetails,
  useUpdateOrganizationCompanyDetails,
  useUpdateProfile,
} from '@/api/generated/api';
import { captureAsMember } from '@/app/observability/posthog';
import { PublicFrame, PublicFrameAction } from '@/app/public-frame';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { useMe } from '@/features/account/use-me';

import { OnboardingProgress, SignedInAs } from './onboarding-frame';
import {
  contractStepSchema,
  type ContractStepValues,
  signatoryStepSchema,
  type SignatoryStepValues,
  withStepDetails,
} from './onboarding-steps-schema';

type CompanyDetails = OrganizationCompanyDetailsResponse['companyDetails'];
type Member = MeResponse & { membership: NonNullable<MeResponse['membership']> };

interface StepCopy {
  step: 2 | 3;
  name: string;
  testId: string;
  title: string;
}

const signatoryCopy: StepCopy = {
  step: 2,
  name: 'Cine semnează',
  testId: 'onboarding-signatory-page',
  title: 'Cine semnează documentele',
};

const contractCopy: StepCopy = {
  step: 3,
  name: 'Contract',
  testId: 'onboarding-contract-page',
  title: 'Datele pentru contract',
};

export function SignatoryStep() {
  return (
    <OwnerStep copy={signatoryCopy}>
      {(me, saved) => <SignatoryForm me={me} saved={saved} />}
    </OwnerStep>
  );
}

export function ContractStep() {
  return (
    <OwnerStep copy={contractCopy}>
      {(me, saved) => <ContractForm me={me} saved={saved} />}
    </OwnerStep>
  );
}

// The steps write the organization's company details, which only an owner may change, so a
// specialist who follows the address lands in the app instead.
function OwnerStep({
  copy,
  children,
}: {
  copy: StepCopy;
  children: (me: Member, saved: CompanyDetails) => ReactNode;
}) {
  const me = useMe();
  if (me.isPending) return <StepLoading copy={copy} />;
  if (me.isError) return <StepFailed copy={copy} retry={() => void me.refetch()} />;
  if (!me.data.membership) return <Navigate to="/configurare" replace />;
  if (me.data.membership.role !== 'owner') return <Navigate to="/dashboard" replace />;
  return (
    <WithCompanyDetails copy={copy} me={me.data as Member}>
      {children}
    </WithCompanyDetails>
  );
}

function WithCompanyDetails({
  copy,
  me,
  children,
}: {
  copy: StepCopy;
  me: Member;
  children: (me: Member, saved: CompanyDetails) => ReactNode;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const details = useGetOrganizationCompanyDetails({
    request: apiRequest,
    query: { queryKey: [...getGetOrganizationCompanyDetailsQueryKey(), me.user.id] },
  });
  if (details.isPending) return <StepLoading copy={copy} />;
  if (details.isError) return <StepFailed copy={copy} retry={() => void details.refetch()} />;
  return children(me, details.data.companyDetails);
}

function StepLoading({ copy }: { copy: StepCopy }) {
  return (
    <PublicFrame
      testId="onboarding-step-loading"
      progress={<OnboardingProgress step={copy.step} name={copy.name} />}
      title={copy.title}
    >
      <p role="status" className="text-center text-sm text-muted-foreground">
        Se încarcă…
      </p>
    </PublicFrame>
  );
}

function StepFailed({ copy, retry }: { copy: StepCopy; retry: () => void }) {
  const navigate = useNavigate();
  return (
    <PublicFrame
      testId="onboarding-step-error"
      progress={<OnboardingProgress step={copy.step} name={copy.name} />}
      title={copy.title}
      description="Nu am putut încărca datele organizației. Verifică conexiunea și încearcă din nou."
    >
      <PublicFrameAction onClick={retry}>Încearcă din nou</PublicFrameAction>
      <PublicFrameAction
        variant="outline"
        onClick={() => void navigate({ to: '/dashboard', replace: true })}
      >
        Completez mai târziu
      </PublicFrameAction>
    </PublicFrame>
  );
}

function useStepNavigation(me: Member, step: 2 | 3) {
  const navigate = useNavigate();
  const next = step === 2 ? '/configurare/contract' : '/dashboard';

  return {
    completed: async () => {
      captureAsMember(me.user.id, 'onboarding_step_completed', { step, skipped_rest: false });
      await navigate({ to: next, replace: true });
    },
    later: async () => {
      captureAsMember(me.user.id, 'onboarding_step_skipped', { step, skipped_rest: false });
      await navigate({ to: next, replace: true });
    },
    skipRest: async () => {
      captureAsMember(me.user.id, 'onboarding_step_skipped', { step, skipped_rest: true });
      await navigate({ to: '/dashboard', replace: true });
    },
  };
}

function useSaveDetails(me: Member) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateOrganizationCompanyDetails({ request: apiRequest });
  return async (saved: CompanyDetails, changes: Partial<CompanyDetails>) => {
    const response = await update.mutateAsync({ data: withStepDetails(saved, changes) });
    queryClient.setQueryData([...getGetOrganizationCompanyDetailsQueryKey(), me.user.id], response);
  };
}

const saveFailed = 'Nu am putut salva. Verifică conexiunea și încearcă din nou.';

function StepActions({
  busy,
  submitLabel,
  onLater,
  onSkipRest,
}: {
  busy: boolean;
  submitLabel: string;
  onLater: () => void;
  onSkipRest?: () => void;
}) {
  return (
    <div className="grid gap-3 pt-1">
      <PublicFrameAction data-testid="onboarding-continue" type="submit" disabled={busy}>
        {busy ? 'Se salvează…' : submitLabel}
      </PublicFrameAction>
      <PublicFrameAction
        data-testid="onboarding-later"
        type="button"
        variant="outline"
        disabled={busy}
        onClick={onLater}
      >
        Completez mai târziu
      </PublicFrameAction>
      {onSkipRest && (
        <button
          type="button"
          data-testid="onboarding-skip-rest"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-self-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          onClick={onSkipRest}
        >
          Sari peste restul și intră în aplicație
        </button>
      )}
    </div>
  );
}

function StepSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 [&+&]:border-t [&+&]:pt-5">
      <h2 id={id} className="text-[0.9375rem] font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SignatoryForm({ me, saved }: { me: Member; saved: CompanyDetails }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const saveDetails = useSaveDetails(me);
  const updateProfile = useUpdateProfile({ request: apiRequest });
  const steps = useStepNavigation(me, 2);
  const ownName = me.profile?.fullName ?? '';
  const form = useForm<SignatoryStepValues>({
    resolver: zodResolver(signatoryStepSchema),
    defaultValues: {
      representativeIsMe: saved.legalRepresentativeName
        ? saved.legalRepresentativeName === ownName
        : Boolean(ownName),
      legalRepresentativeName: saved.legalRepresentativeName ?? ownName,
      legalRepresentativeRole: saved.legalRepresentativeRole ?? '',
      professionalTitle: me.profile?.professionalTitle ?? '',
    },
  });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveDetails(saved, {
        legalRepresentativeName: values.legalRepresentativeName || null,
        legalRepresentativeRole: values.legalRepresentativeRole || null,
      });
      const title = values.professionalTitle || null;
      if (me.profile && title !== me.profile.professionalTitle) {
        await updateProfile.mutateAsync({
          data: { fullName: me.profile.fullName, professionalTitle: title },
        });
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    } catch {
      form.setError('root.server', { message: saveFailed });
      return;
    }
    await steps.completed();
  });

  return (
    <PublicFrame
      testId={signatoryCopy.testId}
      progress={<OnboardingProgress step={2} name={signatoryCopy.name} />}
      title={signatoryCopy.title}
      description="Numele acestea apar pe contractul cu clienții și pe documentele SSM și SU. ANAF nu le are, așa că le scrii aici o singură dată."
    >
      <form
        ref={formRef}
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Notice variant="success" data-testid="onboarding-created">
          Organizația {me.membership.organization.name} a fost creată. Ce urmează poți completa și
          mai târziu.
        </Notice>
        <StepSection id="onboarding-representative" title="Reprezentantul legal al firmei">
          {ownName && (
            <div className="flex items-start gap-3">
              <Controller
                control={form.control}
                name="representativeIsMe"
                render={({ field }) => (
                  <Checkbox
                    id="onboarding-representative-is-me"
                    data-testid="onboarding-representative-is-me"
                    className="mt-0.5"
                    checked={field.value}
                    disabled={isSubmitting}
                    onCheckedChange={(checked) => {
                      const isMe = checked === true;
                      field.onChange(isMe);
                      form.setValue('legalRepresentativeName', isMe ? ownName : '');
                    }}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Label htmlFor="onboarding-representative-is-me" className="font-normal">
                Eu sunt reprezentantul legal
              </Label>
            </div>
          )}
          <Field
            id="onboarding-representative-name"
            label="Nume și prenume"
            hint="Așa cum apare în actele firmei."
            error={errors.legalRepresentativeName}
          >
            <Input
              id="onboarding-representative-name"
              data-testid="onboarding-representative-name"
              className="h-11"
              autoComplete="off"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.legalRepresentativeName)}
              aria-describedby={
                errors.legalRepresentativeName
                  ? 'onboarding-representative-name-error'
                  : 'onboarding-representative-name-hint'
              }
              {...form.register('legalRepresentativeName', {
                onChange: (event: { target: { value: string } }) =>
                  form.setValue('representativeIsMe', event.target.value.trim() === ownName),
              })}
            />
          </Field>
          <Field
            id="onboarding-representative-role"
            label="Funcție"
            hint="De exemplu „Administrator” sau „Director general”."
            error={errors.legalRepresentativeRole}
          >
            <Input
              id="onboarding-representative-role"
              data-testid="onboarding-representative-role"
              className="h-11"
              autoComplete="off"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.legalRepresentativeRole)}
              aria-describedby={
                errors.legalRepresentativeRole
                  ? 'onboarding-representative-role-error'
                  : 'onboarding-representative-role-hint'
              }
              {...form.register('legalRepresentativeRole')}
            />
          </Field>
        </StepSection>
        <StepSection id="onboarding-own-title" title="Titlul tău profesional">
          <Field
            id="onboarding-professional-title"
            label="Titlul profesional"
            hint="Apare lângă numele tău pe documentele pe care le întocmești, de exemplu „Evaluator de riscuri atestat”. Nu e funcția ta din firmă."
            error={errors.professionalTitle}
          >
            <Input
              id="onboarding-professional-title"
              data-testid="onboarding-professional-title"
              className="h-11"
              autoComplete="organization-title"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.professionalTitle)}
              aria-describedby={
                errors.professionalTitle
                  ? 'onboarding-professional-title-error'
                  : 'onboarding-professional-title-hint'
              }
              {...form.register('professionalTitle')}
            />
          </Field>
        </StepSection>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="onboarding-step-error-message">
            {errors.root.server.message}
          </Notice>
        )}
        <StepActions
          busy={isSubmitting}
          submitLabel="Continuă"
          onLater={() => void steps.later()}
          onSkipRest={() => void steps.skipRest()}
        />
      </form>
      <SignedInAs email={me.user.email} />
    </PublicFrame>
  );
}

// The company details hold what step 1 kept, and step 1 keeps a phone or an IBAN only from ANAF.
function contractLead(saved: CompanyDetails) {
  const lead = 'Apar în contractul de servicii cu clienții.';
  if (!saved.legalName) return lead;
  if (saved.phone && saved.iban) return `${lead} Le-am găsit pe amândouă la ANAF.`;
  if (saved.phone) return `${lead} Le-am căutat la ANAF: telefonul l-am găsit, contul bancar nu.`;
  if (saved.iban) return `${lead} Le-am căutat la ANAF: contul bancar l-am găsit, telefonul nu.`;
  return `${lead} ANAF nu le are pentru firma ta, așa că le scrii aici.`;
}

function FromAnaf() {
  return (
    <span className="inline-flex items-center gap-1.5 text-success-foreground">
      <Check aria-hidden="true" className="size-3.5" />
      Preluat de la ANAF. Îl poți schimba.
    </span>
  );
}

function ContractForm({ me, saved }: { me: Member; saved: CompanyDetails }) {
  const saveDetails = useSaveDetails(me);
  const steps = useStepNavigation(me, 3);
  const fromAnaf = Boolean(saved.legalName);
  const form = useForm<ContractStepValues>({
    resolver: zodResolver(contractStepSchema),
    defaultValues: {
      phone: saved.phone ?? '',
      iban: saved.iban ? formatIban(saved.iban) : '',
      bankName: saved.bankName ?? bankNameForIban(saved.iban ?? '') ?? '',
    },
  });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting } = form.formState;
  const [iban, bankName] = useWatch({ control: form.control, name: ['iban', 'bankName'] });
  const recognised = Boolean(bankName) && bankName === bankNameForIban(iban);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveDetails(saved, {
        phone: values.phone || null,
        iban: values.iban || null,
        bankName: values.bankName || null,
      });
    } catch {
      form.setError('root.server', { message: saveFailed });
      return;
    }
    await steps.completed();
  });

  return (
    <PublicFrame
      testId={contractCopy.testId}
      progress={<OnboardingProgress step={3} name={contractCopy.name} />}
      title={contractCopy.title}
      description={contractLead(saved)}
    >
      <form
        ref={formRef}
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field
          id="onboarding-phone"
          label="Telefonul firmei"
          hint={fromAnaf && saved.phone ? <FromAnaf /> : undefined}
          error={errors.phone}
        >
          <Input
            id="onboarding-phone"
            data-testid="onboarding-phone"
            className="h-11"
            type="tel"
            autoComplete="tel"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={
              errors.phone
                ? 'onboarding-phone-error'
                : fromAnaf && saved.phone
                  ? 'onboarding-phone-hint'
                  : undefined
            }
            {...form.register('phone')}
          />
        </Field>
        <Field
          id="onboarding-iban"
          label="IBAN"
          hint="Contul în care îți plătesc clienții. Cu sau fără spații."
          error={errors.iban}
        >
          <Input
            id="onboarding-iban"
            data-testid="onboarding-iban"
            className="h-11"
            autoComplete="off"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.iban)}
            aria-describedby={errors.iban ? 'onboarding-iban-error' : 'onboarding-iban-hint'}
            {...form.register('iban', {
              onChange: (event: { target: { value: string } }) =>
                form.setValue(
                  'bankName',
                  bankNameAfterIbanChange(event.target.value, form.getValues('bankName'))
                ),
            })}
          />
        </Field>
        <Field
          id="onboarding-bank"
          label="Banca"
          hint={
            recognised
              ? 'Am recunoscut-o din IBAN. O poți corecta.'
              : 'O recunoaștem din IBAN pentru băncile din România.'
          }
          error={errors.bankName}
        >
          <Input
            id="onboarding-bank"
            data-testid="onboarding-bank"
            className="h-11"
            autoComplete="off"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.bankName)}
            aria-describedby={errors.bankName ? 'onboarding-bank-error' : 'onboarding-bank-hint'}
            {...form.register('bankName')}
          />
        </Field>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="onboarding-step-error-message">
            {errors.root.server.message}
          </Notice>
        )}
        <StepActions
          busy={isSubmitting}
          submitLabel="Salvează și intră în aplicație"
          onLater={() => void steps.later()}
        />
      </form>
      <SignedInAs email={me.user.email} />
    </PublicFrame>
  );
}
