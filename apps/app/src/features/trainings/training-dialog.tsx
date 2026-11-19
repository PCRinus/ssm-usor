import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatEmployeeName,
  signerSlotLabels,
  supplementaryTrainingReasonLabels,
  supplementaryTrainingReasons,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
  type TrainingPhase,
  trainingPhaseLabels,
  trainingPhases,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  getGetTrainingQueryKey,
  getListJobPositionsQueryKey,
  type JobPositionListResponseItemsItem,
  type TrainingResponseTraining,
  useCreateTraining,
  useGetTraining,
  useListJobPositions,
  useUpdateTraining,
} from '@/api/generated/api';
import { apiErrorBody, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { replayMask, replayShow } from '@/app/observability/replay-masking';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { HelpLink } from '@/components/help-link';
import { LoadFailed } from '@/components/load-failed';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { signingMessage } from '@/features/signatures/signature-format';
import { commonFailure, setApiIssues } from '@/lib/api-errors';
import { todayIso } from '@/lib/dates';

import { AttendeeChecklist, type AttendeeOption } from './attendee-checklist';
import { SignerSlot } from './signer-slot';
import {
  emptySigners,
  type SlotNameField,
  toTrainingForm,
  toTrainingRequest,
  trainingFormSchema,
  type TrainingFormValues,
  trainingIssueTarget,
} from './training-form-schema';
import { attendeeCountLabel, notOnSheet } from './training-format';
import { type CurrentEmployee, invalidateTrainings, useCurrentEmployees } from './training-queries';
import { useSignerSlots } from './use-signer-slots';
import { useTrainingProposal } from './use-training-proposal';

export type TrainingDialogTarget =
  | { kind: 'new'; domain: TrainingDomain; phase: TrainingPhase }
  | { kind: 'edit'; trainingId: string };

export interface FixedAttendee {
  id: string;
  lastName: string;
  firstName: string;
  jobPosition: { id: string; name: string };
}

export function TrainingDialog({
  clientId,
  userId,
  target,
  fixedAttendee,
  onClose,
}: {
  clientId: string;
  userId: string;
  target: TrainingDialogTarget | null;
  // The employee whose page opened the dialog: the only attendee of a training recorded there.
  fixedAttendee?: FixedAttendee;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      {target && (
        <TrainingDialogContent
          key={target.kind === 'edit' ? target.trainingId : 'new'}
          clientId={clientId}
          userId={userId}
          target={target}
          fixedAttendee={fixedAttendee}
          onBusyChange={setSaving}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function TrainingDialogContent({
  clientId,
  userId,
  target,
  fixedAttendee,
  onBusyChange,
  onClose,
}: {
  clientId: string;
  userId: string;
  target: TrainingDialogTarget;
  fixedAttendee?: FixedAttendee;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { request, ready, key } = useApi();
  const enabled = ready;
  const positions = useListJobPositions(clientId, {
    request,
    query: { queryKey: key(getListJobPositionsQueryKey(clientId)), enabled },
  });
  const employees = useCurrentEmployees(clientId);
  const trainingId = target.kind === 'edit' ? target.trainingId : '';
  const training = useGetTraining(clientId, trainingId, {
    request,
    query: {
      queryKey: key(getGetTrainingQueryKey(clientId, trainingId)),
      enabled: enabled && target.kind === 'edit',
    },
  });
  const title = target.kind === 'edit' ? 'Modifică instruirea' : 'Înregistrează o instruire';
  const failed = positions.isError || employees.isError || training.isError;
  const loadErrors = [positions.error, employees.error, training.error];
  const loadError =
    loadErrors.find((error) => commonFailure(error) !== undefined) ??
    loadErrors.find((error) => error != null);

  if (!positions.data || !employees.data || (target.kind === 'edit' && !training.data) || failed) {
    return (
      <DialogContent data-testid="training-dialog" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {failed ? (
          <LoadFailed testId="training-dialog-load-error" error={loadError}>
            {training.error instanceof ApiHttpError && training.error.status === 404
              ? 'Instruirea nu mai există la acest client.'
              : 'Nu am putut încărca datele instruirii. Închide și încearcă din nou.'}
          </LoadFailed>
        ) : (
          <div className="grid gap-4" aria-busy="true">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </DialogContent>
    );
  }

  return (
    <TrainingForm
      clientId={clientId}
      userId={userId}
      target={target}
      training={training.data?.training ?? null}
      positions={positions.data.items}
      employees={employees.data}
      fixedAttendee={fixedAttendee}
      onBusyChange={onBusyChange}
      onClose={onClose}
    />
  );
}

function attendeesPosition(
  training: TrainingResponseTraining,
  employees: CurrentEmployee[],
  positions: JobPositionListResponseItemsItem[]
) {
  const counts = new Map<string, number>();
  for (const record of training.records) {
    const positionId =
      employees.find((employee) => employee.id === record.employee.id)?.jobPosition.id ??
      positions.find((position) => position.name.trim() === record.occupation.trim())?.id;
    if (positionId) counts.set(positionId, (counts.get(positionId) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function attendeeOptions(
  employees: CurrentEmployee[],
  phase: TrainingPhase,
  jobPositionId: string
) {
  if (phase === 'introductory_general') return employees;
  return jobPositionId
    ? employees.filter((employee) => employee.jobPosition.id === jobPositionId)
    : [];
}

function TrainingForm({
  clientId,
  userId,
  target,
  training,
  positions,
  employees,
  fixedAttendee,
  onBusyChange,
  onClose,
}: {
  clientId: string;
  userId: string;
  target: TrainingDialogTarget;
  training: TrainingResponseTraining | null;
  positions: JobPositionListResponseItemsItem[];
  employees: CurrentEmployee[];
  fixedAttendee?: FixedAttendee;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { request, queryClient } = useApi();
  const create = useCreateTraining({ request });
  const update = useUpdateTraining({ request });
  const fixed =
    fixedAttendee &&
    (!training || training.records.every((record) => record.employee.id === fixedAttendee.id))
      ? fixedAttendee
      : null;
  const form = useForm<TrainingFormValues>({
    resolver: zodResolver(trainingFormSchema),
    defaultValues: training
      ? toTrainingForm(
          training,
          attendeesPosition(training, employees, positions) || (fixed?.jobPosition.id ?? '')
        )
      : {
          domain: target.kind === 'new' ? target.domain : 'ssm',
          phase: target.kind === 'new' ? target.phase : 'periodic',
          heldOn: todayIso(),
          source: 'app',
          jobPositionId: fixed?.jobPosition.id ?? '',
          employeeIds: fixed ? [fixed.id] : [],
          durationMinutes: '',
          material: '',
          trainerName: '',
          trainerJobTitle: '',
          verifierName: '',
          verifierJobTitle: '',
          supplementaryReason: '',
          admittedOn: '',
          admittedByName: '',
          admittedByJobTitle: '',
          notes: '',
          themesRevisionId: null,
          ...emptySigners,
        },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const { markTyped, typing, missingMaterial } = useTrainingProposal(form, {
    clientId,
    training,
  });
  const signerSlots = useSignerSlots(form, { clientId, userId, training });
  const typingName = (field: SlotNameField) => ({
    onChange: () => {
      markTyped(field);
      signerSlots.nameTyped(field);
    },
  });
  const [domain, phase, jobPositionId, source] = useWatch({
    control: form.control,
    name: ['domain', 'phase', 'jobPositionId', 'source'],
  });
  const { verifierName, admittedByName } = signerSlots.slotNames;
  const signing = source === 'app';
  const fromPaper = source === 'paper';

  const position = positions.find((item) => item.id === jobPositionId);
  const options: AttendeeOption[] = attendeeOptions(employees, phase, jobPositionId).map(
    (employee) => ({
      id: employee.id,
      name: formatEmployeeName(employee),
      detail: phase === 'introductory_general' ? employee.jobPosition.name : undefined,
    })
  );
  const listed = new Set(options.map((option) => option.id));
  for (const record of training?.records ?? []) {
    if (!listed.has(record.employee.id)) {
      options.push({
        id: record.employee.id,
        name: formatEmployeeName(record.employee),
        detail: record.occupation,
      });
    }
  }

  function keepListed(nextPhase: TrainingPhase, nextPositionId: string) {
    const next = new Set(
      attendeeOptions(employees, nextPhase, nextPositionId).map((employee) => employee.id)
    );
    for (const record of training?.records ?? []) next.add(record.employee.id);
    return next;
  }

  function changePosition(nextPositionId: string) {
    if (fixed) return;
    const next = keepListed(phase, nextPositionId);
    const kept = form.getValues('employeeIds').filter((id) => next.has(id));
    // A periodic training is usually held for everyone in the post at once.
    const everyone =
      !training && phase === 'periodic' && nextPositionId
        ? attendeeOptions(employees, phase, nextPositionId).map((employee) => employee.id)
        : [];
    form.setValue('employeeIds', [...new Set([...kept, ...everyone])], {
      shouldValidate: form.formState.isSubmitted,
    });
  }

  function changePhase(nextPhase: TrainingPhase) {
    if (fixed) return;
    const next = keepListed(nextPhase, jobPositionId);
    form.setValue(
      'employeeIds',
      form.getValues('employeeIds').filter((id) => next.has(id)),
      { shouldValidate: form.formState.isSubmitted }
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toTrainingRequest(values);
    try {
      if (training) await update.mutateAsync({ clientId, trainingId: training.id, data });
      else await create.mutateAsync({ clientId, data });
      await invalidateTrainings(queryClient, clientId);
      toast.success(training ? 'Instruirea a fost modificată.' : 'Instruirea a fost înregistrată.');
      onClose();
    } catch (cause) {
      const status = cause instanceof ApiHttpError ? cause.status : null;
      const body = apiErrorBody(cause);
      if (status === 400 && body?.issues?.some((issue) => issue.path === 'themesRevisionId')) {
        form.setValue('themesRevisionId', null);
        form.setError('root.server', {
          message:
            'Tematica din care a fost propus materialul nu mai există. Verifică materialul și salvează din nou.',
        });
        return;
      }
      if (
        (status === 400 || status === 422) &&
        setApiIssues(form.setError, body?.issues, (path) => {
          const target = trainingIssueTarget(path);
          return (
            target && {
              field: target.field,
              message: target.message ?? signingMessage(cause, training) ?? undefined,
            }
          );
        })
      ) {
        return;
      }
      form.setError('root.server', {
        message:
          signingMessage(cause, training) ??
          commonFailure(cause) ??
          (status === 409
            ? 'Clientul este arhivat; instruirile lui nu mai pot fi modificate.'
            : status === 404
              ? 'Instruirea nu mai există la acest client.'
              : 'Nu am putut salva instruirea. Verifică conexiunea și încearcă din nou.'),
      });
    }
  });

  const attendeeCount = training?.records.length ?? 0;
  const durationValue = useWatch({ control: form.control, name: 'durationMinutes' });
  const minutes = /^\d+$/.test(durationValue.trim()) ? Number(durationValue) : null;
  const durationHint =
    minutes && minutes % 60 === 0 ? `Adică ${minutes / 60} h.` : 'Fișa o tipărește în ore.';

  return (
    <DialogContent data-testid="training-dialog" className="sm:max-w-3xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {training ? 'Modifică instruirea' : 'Înregistrează o instruire'}
          </DialogTitle>
          <DialogDescription>
            Fiecare participant primește instruirea în fișa lui individuală.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5 sm:grid-cols-2">
          {attendeeCount > 1 && (
            <Notice variant="info" data-testid="training-shared-notice" className="sm:col-span-2">
              Această instruire are {attendeeCountLabel(attendeeCount)}; modificarea îi privește pe
              toți.
            </Notice>
          )}
          <Field id="training-domain" label="Domeniu" mark="required" error={errors.domain}>
            <NativeSelect
              id="training-domain"
              data-testid="training-domain"
              {...replayShow}
              disabled={busy}
              {...form.register('domain')}
            >
              {trainingDomains.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {trainingDomainLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="training-phase" label="Tipul instruirii" mark="required" error={errors.phase}>
            <NativeSelect
              id="training-phase"
              data-testid="training-phase"
              {...replayShow}
              disabled={busy}
              {...form.register('phase', {
                onChange: (event: { target: { value: TrainingPhase } }) =>
                  changePhase(event.target.value),
              })}
            >
              {trainingPhases.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {trainingPhaseLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="training-held-on" label="Ziua" mark="required" error={errors.heldOn}>
            <Controller
              control={form.control}
              name="heldOn"
              render={({ field }) => (
                <DatePicker
                  id="training-held-on"
                  testId="training-held-on"
                  value={field.value}
                  max={todayIso()}
                  disabled={busy}
                  invalid={Boolean(errors.heldOn)}
                  describedBy={errors.heldOn ? 'training-held-on-error' : undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  required
                />
              )}
            />
          </Field>
          <Controller
            control={form.control}
            name="source"
            render={({ field }) => (
              <div className="flex min-h-11 items-center gap-2 sm:mt-7 sm:self-start">
                <label
                  htmlFor="training-source"
                  className="flex cursor-pointer items-center gap-2.5 text-sm font-medium"
                >
                  <Checkbox
                    id="training-source"
                    data-testid="training-source"
                    {...replayShow}
                    checked={field.value === 'paper'}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true ? 'paper' : 'app')
                    }
                  />
                  Transcrisă de pe fișa pe hârtie
                </label>
                <HelpLink
                  topic="angajati.instruire-de-pe-hartie"
                  label="Despre instruirile transcrise de pe fișa pe hârtie"
                />
              </div>
            )}
          />
          <Field
            id="training-position"
            label="Post de lucru"
            mark={phase === 'introductory_general' ? 'optional' : 'required'}
            hint={
              phase === 'introductory_general'
                ? 'Instruirea introductiv-generală poate cuprinde lucrători de pe orice post.'
                : 'Participanții și materialul propus urmează postul.'
            }
            error={errors.jobPositionId}
            className="sm:col-span-2"
          >
            <NativeSelect
              id="training-position"
              data-testid="training-position"
              {...replayShow}
              disabled={busy}
              aria-invalid={Boolean(errors.jobPositionId)}
              aria-describedby={
                errors.jobPositionId ? 'training-position-error' : 'training-position-hint'
              }
              {...form.register('jobPositionId', {
                onChange: (event: { target: { value: string } }) =>
                  changePosition(event.target.value),
              })}
            >
              <NativeSelectOption value="">Alege postul</NativeSelectOption>
              {positions.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
              {fixed && !positions.some((item) => item.id === fixed.jobPosition.id) && (
                <NativeSelectOption value={fixed.jobPosition.id}>
                  {fixed.jobPosition.name}
                </NativeSelectOption>
              )}
            </NativeSelect>
          </Field>
          <Field
            id="training-attendees"
            label="Participanți"
            mark="required"
            error={
              errors.employeeIds
                ? { type: 'manual', message: errors.employeeIds.message }
                : undefined
            }
            className="sm:col-span-2"
          >
            {fixed ? (
              <p
                id="training-attendees"
                data-testid="training-fixed-attendee"
                className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm font-medium"
                {...replayMask}
              >
                {formatEmployeeName(fixed)}
              </p>
            ) : phase !== 'introductory_general' && !jobPositionId ? (
              <p
                id="training-attendees"
                className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground"
              >
                Alege postul pentru a vedea lucrătorii lui.
              </p>
            ) : options.length === 0 ? (
              <p
                id="training-attendees"
                data-testid="training-attendees-empty"
                className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground"
              >
                {position
                  ? `Postul „${position.name}” nu are lucrători actuali.`
                  : 'Clientul nu are lucrători actuali.'}
              </p>
            ) : (
              <Controller
                control={form.control}
                name="employeeIds"
                render={({ field }) => (
                  <AttendeeChecklist
                    id="training-attendees"
                    options={options}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={busy}
                    invalid={Boolean(errors.employeeIds)}
                    describedBy={errors.employeeIds ? 'training-attendees-error' : undefined}
                  />
                )}
              />
            )}
          </Field>
          {phase === 'supplementary' && (
            <Field
              id="training-reason"
              label="Motivul instruirii suplimentare"
              mark="required"
              error={errors.supplementaryReason}
              className="sm:col-span-2"
            >
              <NativeSelect
                id="training-reason"
                data-testid="training-reason"
                {...replayShow}
                disabled={busy}
                aria-invalid={Boolean(errors.supplementaryReason)}
                aria-describedby={errors.supplementaryReason ? 'training-reason-error' : undefined}
                {...form.register('supplementaryReason')}
              >
                <NativeSelectOption value="">Alege motivul</NativeSelectOption>
                {supplementaryTrainingReasons.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {supplementaryTrainingReasonLabels[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          {missingMaterial && (
            <Notice variant="warning" data-testid="training-no-themes" className="sm:col-span-2">
              Tematica de instruire nu este încă generată; completează materialul.
            </Notice>
          )}
          <Field
            id="training-duration"
            label="Durata (minute)"
            mark={fromPaper ? 'optional' : 'required'}
            hint={durationHint}
            error={errors.durationMinutes}
          >
            <Input
              id="training-duration"
              data-testid="training-duration"
              {...replayShow}
              placeholder={fromPaper ? notOnSheet.duration : undefined}
              inputMode="numeric"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.durationMinutes)}
              aria-describedby={
                errors.durationMinutes ? 'training-duration-error' : 'training-duration-hint'
              }
              {...form.register('durationMinutes', typing('durationMinutes'))}
            />
          </Field>
          <Field
            id="training-material"
            label="Materialul predat"
            mark={fromPaper ? 'optional' : 'required'}
            error={errors.material}
            className="sm:col-span-2"
          >
            <Textarea
              id="training-material"
              data-testid="training-material"
              {...replayShow}
              placeholder={fromPaper ? notOnSheet.material : undefined}
              rows={4}
              disabled={busy}
              aria-invalid={Boolean(errors.material)}
              aria-describedby={errors.material ? 'training-material-error' : undefined}
              {...form.register('material', typing('material'))}
            />
          </Field>
          <Field
            id="training-trainer-name"
            label="A instruit"
            mark={fromPaper ? 'optional' : 'required'}
            error={errors.trainerName}
          >
            <Input
              id="training-trainer-name"
              data-testid="training-trainer-name"
              placeholder={fromPaper ? notOnSheet.name : undefined}
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.trainerName)}
              aria-describedby={errors.trainerName ? 'training-trainer-name-error' : undefined}
              {...form.register('trainerName', typingName('trainerName'))}
            />
          </Field>
          <Field
            id="training-trainer-job-title"
            label="Funcția celui care a instruit"
            mark={fromPaper ? 'optional' : 'required'}
            error={errors.trainerJobTitle}
          >
            <Input
              id="training-trainer-job-title"
              data-testid="training-trainer-job-title"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.trainerJobTitle)}
              aria-describedby={
                errors.trainerJobTitle ? 'training-trainer-job-title-error' : undefined
              }
              {...form.register('trainerJobTitle', typing('trainerJobTitle'))}
            />
          </Field>
          {signing && (
            <SignerSlot
              form={form}
              slots={signerSlots}
              nameField="trainerName"
              id="training-trainer-signer"
              label={`Semnatar la „${signerSlotLabels.trainer}”`}
              busy={busy}
              markTyped={markTyped}
            />
          )}
          {domain === 'ssm' && (
            <>
              <Field
                id="training-verifier-name"
                label="A verificat"
                mark="optional"
                error={errors.verifierName}
              >
                <Input
                  id="training-verifier-name"
                  data-testid="training-verifier-name"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={Boolean(errors.verifierName)}
                  aria-describedby={
                    errors.verifierName ? 'training-verifier-name-error' : undefined
                  }
                  {...form.register('verifierName', typingName('verifierName'))}
                />
              </Field>
              <Field
                id="training-verifier-job-title"
                label="Funcția celui care a verificat"
                mark="optional"
                error={errors.verifierJobTitle}
              >
                <Input
                  id="training-verifier-job-title"
                  data-testid="training-verifier-job-title"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={Boolean(errors.verifierJobTitle)}
                  aria-describedby={
                    errors.verifierJobTitle ? 'training-verifier-job-title-error' : undefined
                  }
                  {...form.register('verifierJobTitle', typing('verifierJobTitle'))}
                />
              </Field>
              {signing && verifierName.trim() && (
                <SignerSlot
                  form={form}
                  slots={signerSlots}
                  nameField="verifierName"
                  id="training-verifier-signer"
                  label={`Semnatar la „${signerSlotLabels.verifier}”`}
                  busy={busy}
                  markTyped={markTyped}
                />
              )}
            </>
          )}
          {phase === 'workplace' && (
            <fieldset className="grid gap-5 rounded-md border p-4 sm:col-span-2 sm:grid-cols-3">
              <legend className="px-1 text-sm font-medium">Admis la lucru</legend>
              <Field id="training-admitted-on" label="Ziua" error={errors.admittedOn}>
                <Controller
                  control={form.control}
                  name="admittedOn"
                  render={({ field }) => (
                    <DatePicker
                      id="training-admitted-on"
                      testId="training-admitted-on"
                      value={field.value}
                      disabled={busy}
                      invalid={Boolean(errors.admittedOn)}
                      describedBy={errors.admittedOn ? 'training-admitted-on-error' : undefined}
                      onChange={(value) => {
                        markTyped('admittedOn');
                        field.onChange(value);
                      }}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </Field>
              <Field id="training-admitted-by-name" label="De către" error={errors.admittedByName}>
                <Input
                  id="training-admitted-by-name"
                  data-testid="training-admitted-by-name"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={Boolean(errors.admittedByName)}
                  aria-describedby={
                    errors.admittedByName ? 'training-admitted-by-name-error' : undefined
                  }
                  {...form.register('admittedByName', typingName('admittedByName'))}
                />
              </Field>
              <Field
                id="training-admitted-by-job-title"
                label="Funcția"
                error={errors.admittedByJobTitle}
              >
                <Input
                  id="training-admitted-by-job-title"
                  data-testid="training-admitted-by-job-title"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={Boolean(errors.admittedByJobTitle)}
                  aria-describedby={
                    errors.admittedByJobTitle ? 'training-admitted-by-job-title-error' : undefined
                  }
                  {...form.register('admittedByJobTitle', typing('admittedByJobTitle'))}
                />
              </Field>
              {signing && domain === 'ssm' && admittedByName.trim() && (
                <SignerSlot
                  form={form}
                  slots={signerSlots}
                  nameField="admittedByName"
                  id="training-admitter-signer"
                  label={`Semnatar la „${signerSlotLabels.admitter}”`}
                  busy={busy}
                  markTyped={markTyped}
                />
              )}
            </fieldset>
          )}
          <Field
            id="training-notes"
            label="Observații"
            mark="optional"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <Textarea
              id="training-notes"
              data-testid="training-notes"
              rows={2}
              disabled={busy}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'training-notes-error' : undefined}
              {...form.register('notes')}
            />
          </Field>
        </DialogBody>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="training-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="training-save" disabled={busy}>
            {busy ? 'Se salvează…' : training ? 'Salvează' : 'Înregistrează'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
