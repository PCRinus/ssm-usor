import { type UseFormReturn, useFormState, useWatch } from 'react-hook-form';

import { SignerSelect } from '@/features/signatures/signer-select';

import {
  type ProposedField,
  signerOfName,
  type SlotNameField,
  type TrainingFormValues,
} from './training-form-schema';
import type { SignerSlots } from './use-signer-slots';

export function SignerSlot({
  form,
  slots,
  nameField,
  id,
  label,
  busy,
  markTyped,
}: {
  form: UseFormReturn<TrainingFormValues>;
  slots: SignerSlots;
  nameField: SlotNameField;
  id: string;
  label: string;
  busy: boolean;
  markTyped: (field: ProposedField) => void;
}) {
  const field = signerOfName[nameField];
  const value = useWatch({ control: form.control, name: field });
  const { errors, isSubmitted } = useFormState({ control: form.control, name: field });
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
        slotName={slots.slotNames[nameField]}
        candidates={slots.candidates}
        requested={slots.requested[field]}
        unavailable={slots.unavailable}
        disabled={busy}
        error={errors[field]}
        onChange={(accountId) => slots.pick(field, accountId)}
        onUseSignerName={(name) => {
          markTyped(nameField);
          form.setValue(nameField, name, { shouldValidate: isSubmitted });
          form.clearErrors(field);
        }}
      />
    </div>
  );
}
