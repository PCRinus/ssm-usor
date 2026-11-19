import { useRouteContext } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { type UseFormReturn, useWatch } from 'react-hook-form';

import {
  getListSignerCandidatesQueryKey,
  type TrainingResponseTraining,
  useListSignerCandidates,
} from '@/api/generated/api';
import { matchSigner } from '@/features/signatures/signer-match';
import { SignerSelect } from '@/features/signatures/signer-select';

import {
  type ProposedField,
  type SignerField,
  signerFields,
  signerOfName,
  type SlotNameField,
  type TrainingFormValues,
} from './training-form-schema';

export function useSignerSlots(
  form: UseFormReturn<TrainingFormValues>,
  {
    clientId,
    userId,
    training,
    busy,
    markTyped,
  }: {
    clientId: string;
    userId: string;
    training: TrainingResponseTraining | null;
    busy: boolean;
    markTyped: (field: ProposedField) => void;
  }
) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
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
  const signerIds: Record<SignerField, string> = {
    trainerSignerId,
    verifierSignerId,
    admitterSignerId,
  };
  const slotNames: Record<SlotNameField, string> = {
    trainerName,
    verifierName,
    admittedByName,
  };
  const { errors } = form.formState;

  const signerSelect = (nameField: SlotNameField, id: string, label: string) => {
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
          value={signerIds[field]}
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

  return { signerSelect, typingName, slotNames };
}
