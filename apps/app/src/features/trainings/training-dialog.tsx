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
  trainingSources,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
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
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getGetTrainingProposalQueryKey,
  getGetTrainingQueryKey,
  getListJobPositionsQueryKey,
  getListSignerCandidatesQueryKey,
  type JobPositionListResponseItemsItem,
  type TrainingResponseTraining,
  useCreateTraining,
  useGetTraining,
  useGetTrainingProposal,
  useListJobPositions,
  useListSignerCandidates,
  useUpdateTraining,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { todayIso } from '@/features/employees/employee-format';
import { signingMessage } from '@/features/signatures/signature-format';
import { matchSigner } from '@/features/signatures/signer-match';
import { SignerSelect } from '@/features/signatures/signer-select';

import { AttendeeChecklist, type AttendeeOption } from './attendee-checklist';
import {
  emptySigners,
  fieldOfIssue,
  type ProposedField,
  proposedFields,
  proposedValues,
  type SignerField,
  signerFields,
  signerOfName,
  type SlotNameField,
  toTrainingForm,
  toTrainingRequest,
  trainingFormSchema,
  type TrainingFormValues,
} from './training-form-schema';
import { trainingSourceLabels } from './training-format';
import { type CurrentEmployee, invalidateTrainings, useCurrentEmployees } from './training-queries';

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
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && (
        <TrainingDialogContent
          key={target.kind === 'edit' ? target.trainingId : 'new'}
          clientId={clientId}
          userId={userId}
          target={target}
          fixedAttendee={fixedAttendee}
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
  onClose,
}: {
  clientId: string;
  userId: string;
  target: TrainingDialogTarget;
  fixedAttendee?: FixedAttendee;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const enabled = Boolean(userId && apiRequest.baseUrl);
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId], enabled },
  });
  const employees = useCurrentEmployees(clientId, userId);
  const trainingId = target.kind === 'edit' ? target.trainingId : '';
  const training = useGetTraining(clientId, trainingId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetTrainingQueryKey(clientId, trainingId), userId],
      enabled: enabled && target.kind === 'edit',
    },
  });
  const title = target.kind === 'edit' ? 'Modifică instruirea' : 'Înregistrează o instruire';
  const failed = positions.isError || employees.isError || training.isError;

  if (!positions.data || !employees.data || (target.kind === 'edit' && !training.data) || failed) {
    return (
      <DialogContent data-testid="training-dialog" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {failed ? (
          <Notice variant="destructive" data-testid="training-dialog-load-error">
            {training.error instanceof ApiHttpError && training.error.status === 404
              ? 'Instruirea nu mai există la acest client.'
              : 'Nu am putut încărca datele instruirii. Închide și încearcă din nou.'}
          </Notice>
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
  onClose,
}: {
  clientId: string;
  userId: string;
  target: TrainingDialogTarget;
  training: TrainingResponseTraining | null;
  positions: JobPositionListResponseItemsItem[];
  employees: CurrentEmployee[];
  fixedAttendee?: FixedAttendee;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateTraining({ request: apiRequest });
  const update = useUpdateTraining({ request: apiRequest });
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
  // What was saved stays as it was: only a new training takes the plan's proposal.
  const [typed, setTyped] = useState<ReadonlySet<ProposedField>>(
    () => new Set(training ? proposedFields : [])
  );
  const markTyped = (field: ProposedField) =>
    setTyped((current) => (current.has(field) ? current : new Set([...current, field])));
  const typing = (field: ProposedField) => ({ onChange: () => markTyped(field) });

  const [domain, phase, heldOn, jobPositionId, source, employeeIds] = useWatch({
    control: form.control,
    name: ['domain', 'phase', 'heldOn', 'jobPositionId', 'source', 'employeeIds'],
  });
  const proposalParams = {
    domain,
    phase,
    heldOn,
    ...(jobPositionId ? { jobPositionId } : {}),
    ...(employeeIds.length > 0 ? { employeeIds: employeeIds.join(',') } : {}),
  };
  const proposing =
    typed.size < proposedFields.length &&
    Boolean(heldOn) &&
    heldOn <= todayIso() &&
    (Boolean(jobPositionId) || phase === 'introductory_general');
  const proposal = useGetTrainingProposal(clientId, proposalParams, {
    request: apiRequest,
    query: {
      queryKey: [...getGetTrainingProposalQueryKey(clientId, proposalParams), userId],
      enabled: proposing && Boolean(apiRequest.baseUrl),
    },
  });
  const proposed = proposing ? proposal.data : undefined;

  useEffect(() => {
    if (!proposed) return;
    const values = proposedValues(proposed, heldOn);
    const validate = form.formState.isSubmitted;
    for (const field of proposedFields) {
      if (!typed.has(field)) form.setValue(field, values[field], { shouldValidate: validate });
    }
    if (!typed.has('material')) form.setValue('themesRevisionId', proposed.themesRevisionId);
  }, [proposed, heldOn, typed, form]);

  const candidates = useListSignerCandidates(clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getListSignerCandidatesQueryKey(clientId), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const signerItems = candidates.data?.items;
  const [trainerName, verifierName, admittedByName] = useWatch({
    control: form.control,
    name: ['trainerName', 'verifierName', 'admittedByName'],
  });
  // A signer the specialist chose stays until the slot's name is typed again; the others follow
  // the names as they are proposed or typed. A saved training's signers were chosen, paper too.
  const [pickedSigners, setPickedSigners] = useState<ReadonlySet<SignerField>>(
    () => new Set(training ? signerFields : [])
  );
  const requestedSigners: Record<SignerField, string | null> = {
    trainerSignerId: training?.signers.trainer ?? null,
    verifierSignerId: training?.signers.verifier ?? null,
    admitterSignerId: training?.signers.admitter ?? null,
  };
  const pickSigner = (field: SignerField, accountId: string) => {
    setPickedSigners((current) => new Set([...current, field]));
    form.clearErrors(field);
    form.setValue(field, accountId);
  };
  const unpickSigner = (field: SignerField) =>
    setPickedSigners((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  const typingName = (field: SlotNameField) => ({
    onChange: () => {
      markTyped(field);
      unpickSigner(signerOfName[field]);
      form.clearErrors(signerOfName[field]);
    },
  });
  const applySignerName = (field: SlotNameField, name: string) => {
    markTyped(field);
    form.setValue(field, name, { shouldValidate: form.formState.isSubmitted });
    form.clearErrors(signerOfName[field]);
  };
  useEffect(() => {
    if (!signerItems) return;
    const names: Record<SignerField, string> = {
      trainerSignerId: trainerName,
      verifierSignerId: verifierName,
      admitterSignerId: admittedByName,
    };
    for (const field of signerFields) {
      if (!pickedSigners.has(field)) {
        form.setValue(field, matchSigner(names[field], signerItems, userId) ?? '');
      }
    }
  }, [signerItems, trainerName, verifierName, admittedByName, pickedSigners, userId, form]);
  const [trainerSignerId, verifierSignerId, admitterSignerId] = useWatch({
    control: form.control,
    name: [...signerFields],
  });
  const slotNames: Record<SlotNameField, string> = {
    trainerName,
    verifierName,
    admittedByName,
  };
  const signerSelect = (nameField: SlotNameField, id: string, label: string, value: string) => {
    const field = signerOfName[nameField];
    return (
      <div
        className={
          field === 'admitterSignerId'
            ? 'grid gap-5 sm:col-span-3 sm:grid-cols-3'
            : 'grid gap-5 sm:col-span-2 sm:grid-cols-2'
        }
      >
        <SignerSelect
          id={id}
          label={label}
          value={value}
          slotName={slotNames[nameField]}
          candidates={signerItems}
          requested={requestedSigners[field]}
          unavailable={candidates.isError}
          disabled={busy}
          error={errors[field]}
          onChange={(accountId) => pickSigner(field, accountId)}
          onUseSignerName={(name) => applySignerName(nameField, name)}
        />
      </div>
    );
  };
  const signing = source === 'app';

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
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (status === 400 && body?.issues?.some((issue) => issue.path === 'themesRevisionId')) {
        form.setValue('themesRevisionId', null);
        form.setError('root.server', {
          message:
            'Tematica din care a fost propus materialul nu mai există. Verifică materialul și salvează din nou.',
        });
        return;
      }
      const fieldIssues =
        status === 400 || status === 422
          ? (body?.issues ?? []).flatMap((issue) => {
              const field = fieldOfIssue[issue.path];
              return field ? [{ field, message: issue.message }] : [];
            })
          : [];
      if (fieldIssues.length > 0) {
        for (const { field, message } of fieldIssues) {
          form.setError(field, {
            message:
              field === 'employeeIds'
                ? 'Un participant nu mai este angajat al clientului. Reîncarcă lista și alege din nou.'
                : field === 'heldOn'
                  ? 'O instruire se înregistrează după ce a avut loc.'
                  : (signingMessage(cause, training) ?? message),
          });
        }
        return;
      }
      form.setError('root.server', {
        message:
          signingMessage(cause, training) ??
          (status === 409
            ? 'Clientul este arhivat; instruirile lui nu mai pot fi modificate.'
            : status === 404
              ? 'Instruirea nu mai există la acest client.'
              : status === 401
                ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                : 'Nu am putut salva instruirea. Verifică conexiunea și încearcă din nou.'),
      });
    }
  });

  const attendeeCount = training?.records.length ?? 0;
  const durationValue = useWatch({ control: form.control, name: 'durationMinutes' });
  const minutes = /^\d+$/.test(durationValue.trim()) ? Number(durationValue) : null;
  const durationHint =
    minutes && minutes % 60 === 0 ? `Adică ${minutes / 60} h.` : 'Fișa o tipărește în ore.';
  const missingMaterial =
    proposed !== undefined && proposed.material === null && !typed.has('material');

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
              Această instruire are {attendeeCount} participanți; modificarea îi privește pe toți.
            </Notice>
          )}
          <Field id="training-domain" label="Domeniu" mark="required" error={errors.domain}>
            <NativeSelect
              id="training-domain"
              data-testid="training-domain"
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
          <Field
            id="training-source"
            label="Sursa"
            mark="required"
            hint="O instruire de pe fișa pe hârtie are semnăturile pe hârtie."
            error={errors.source}
          >
            <NativeSelect
              id="training-source"
              data-testid="training-source"
              disabled={busy}
              aria-describedby="training-source-hint"
              {...form.register('source')}
            >
              {trainingSources.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {trainingSourceLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="training-position"
            label="Post de lucru"
            mark={phase === 'introductory_general' ? 'optional' : 'required'}
            hint={
              phase === 'introductory_general'
                ? 'Instruirea introductiv-generală poate cuprinde angajați de pe orice post.'
                : 'Participanții și materialul propus urmează postul.'
            }
            error={errors.jobPositionId}
            className="sm:col-span-2"
          >
            <NativeSelect
              id="training-position"
              data-testid="training-position"
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
              >
                {formatEmployeeName(fixed)}
              </p>
            ) : phase !== 'introductory_general' && !jobPositionId ? (
              <p
                id="training-attendees"
                className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground"
              >
                Alege postul pentru a vedea angajații lui.
              </p>
            ) : options.length === 0 ? (
              <p
                id="training-attendees"
                data-testid="training-attendees-empty"
                className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground"
              >
                {position
                  ? `Postul „${position.name}” nu are angajați actuali.`
                  : 'Clientul nu are angajați actuali.'}
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
            mark="required"
            hint={durationHint}
            error={errors.durationMinutes}
          >
            <Input
              id="training-duration"
              data-testid="training-duration"
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
            mark="required"
            error={errors.material}
            className="sm:col-span-2"
          >
            <Textarea
              id="training-material"
              data-testid="training-material"
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
            mark="required"
            error={errors.trainerName}
          >
            <Input
              id="training-trainer-name"
              data-testid="training-trainer-name"
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
            mark="required"
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
          {signing &&
            signerSelect(
              'trainerName',
              'training-trainer-signer',
              `Semnatar la „${signerSlotLabels.trainer}”`,
              trainerSignerId
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
              {signing &&
                verifierName.trim() &&
                signerSelect(
                  'verifierName',
                  'training-verifier-signer',
                  `Semnatar la „${signerSlotLabels.verifier}”`,
                  verifierSignerId
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
              {signing &&
                domain === 'ssm' &&
                admittedByName.trim() &&
                signerSelect(
                  'admittedByName',
                  'training-admitter-signer',
                  `Semnatar la „${signerSlotLabels.admitter}”`,
                  admitterSignerId
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
