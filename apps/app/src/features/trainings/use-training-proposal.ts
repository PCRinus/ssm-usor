import { useEffect, useState } from 'react';
import { type UseFormReturn, useWatch } from 'react-hook-form';

import {
  getGetTrainingProposalQueryKey,
  type TrainingResponseTraining,
  useGetTrainingProposal,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { todayIso } from '@/lib/dates';

import {
  type ProposedField,
  proposedFields,
  proposedValues,
  type TrainingFormValues,
} from './training-form-schema';

export function useTrainingProposal(
  form: UseFormReturn<TrainingFormValues>,
  { clientId, training }: { clientId: string; training: TrainingResponseTraining | null }
) {
  const { request, key } = useApi();
  // What was saved stays as it was: only a new training takes the plan's proposal.
  const [typed, setTyped] = useState<ReadonlySet<ProposedField>>(
    () => new Set(training ? proposedFields : [])
  );
  const markTyped = (field: ProposedField) =>
    setTyped((current) => (current.has(field) ? current : new Set([...current, field])));
  const typing = (field: ProposedField) => ({ onChange: () => markTyped(field) });

  const [domain, phase, heldOn, jobPositionId, employeeIds] = useWatch({
    control: form.control,
    name: ['domain', 'phase', 'heldOn', 'jobPositionId', 'employeeIds'],
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
    request,
    query: {
      queryKey: key(getGetTrainingProposalQueryKey(clientId, proposalParams)),
      enabled: proposing && Boolean(request.baseUrl),
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

  const missingMaterial =
    proposed !== undefined && proposed.material === null && !typed.has('material');

  return { markTyped, typing, missingMaterial };
}
