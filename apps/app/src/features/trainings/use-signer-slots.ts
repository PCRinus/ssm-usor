import { useEffect, useState } from 'react';
import { type UseFormReturn, useWatch } from 'react-hook-form';

import {
  getListSignerCandidatesQueryKey,
  type SignerCandidatesResponseItemsItem,
  type TrainingResponseTraining,
  useListSignerCandidates,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { matchSigner } from '@/features/signatures/signer-match';

import {
  type SignerField,
  signerFields,
  signerOfName,
  type SlotNameField,
  type TrainingFormValues,
} from './training-form-schema';

export interface SignerSlots {
  candidates: SignerCandidatesResponseItemsItem[] | undefined;
  unavailable: boolean;
  requested: Record<SignerField, string | null>;
  slotNames: Record<SlotNameField, string>;
  pick: (field: SignerField, accountId: string) => void;
  nameTyped: (field: SlotNameField) => void;
}

export function useSignerSlots(
  form: UseFormReturn<TrainingFormValues>,
  {
    clientId,
    userId,
    training,
  }: { clientId: string; userId: string; training: TrainingResponseTraining | null }
): SignerSlots {
  const { request, ready, key } = useApi();
  const candidates = useListSignerCandidates(clientId, {
    request,
    query: {
      queryKey: key(getListSignerCandidatesQueryKey(clientId)),
      enabled: ready,
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

  return {
    candidates: signerItems,
    unavailable: candidates.isError,
    requested: {
      trainerSignerId: training?.signers.trainer ?? null,
      verifierSignerId: training?.signers.verifier ?? null,
      admitterSignerId: training?.signers.admitter ?? null,
    },
    slotNames: { trainerName, verifierName, admittedByName },
    pick: (field, accountId) => {
      setPickedSigners((current) => new Set([...current, field]));
      form.clearErrors(field);
      form.setValue(field, accountId);
    },
    nameTyped: (nameField) => {
      const field = signerOfName[nameField];
      setPickedSigners((current) => {
        if (!current.has(field)) return current;
        const next = new Set(current);
        next.delete(field);
        return next;
      });
      form.clearErrors(field);
    },
  };
}
