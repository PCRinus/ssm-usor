import { samePerson, type SignerCandidate } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@ssm-usor/ui/components/native-select';
import type { FieldError } from 'react-hook-form';

import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';

import { signerKindLabels } from './signature-format';

const candidateLabel = (candidate: SignerCandidate) =>
  `${candidate.name} · ${candidate.jobTitle ?? signerKindLabels[candidate.kind]}`;

export function SignerSelect({
  id,
  label,
  value,
  slotName,
  candidates,
  requested,
  unavailable,
  disabled,
  error,
  onChange,
  onUseSignerName,
}: {
  id: string;
  label: string;
  value: string;
  // The name the slot prints, which the signer's own name must match (ADR 023).
  slotName: string;
  // The account the slot's live request went to when the training was saved; null when none did.
  requested?: string | null;
  // Undefined while the candidates load.
  candidates: readonly SignerCandidate[] | undefined;
  unavailable: boolean;
  disabled: boolean;
  error?: FieldError;
  onChange: (accountId: string) => void;
  onUseSignerName: (name: string) => void;
}) {
  const members = candidates?.filter((candidate) => candidate.kind === 'member') ?? [];
  const participants = candidates?.filter((candidate) => candidate.kind !== 'member') ?? [];
  const chosen = candidates?.find((candidate) => candidate.accountId === value);
  // An account that left the organization or the client still holds the saved request.
  const stale = Boolean(value) && candidates !== undefined && !chosen;
  const mismatch = chosen && !samePerson(chosen.name, slotName) ? chosen : null;
  const sent = Boolean(requested) && value === requested;
  const hint = unavailable
    ? 'Nu am putut încărca semnatarii; rubrica rămâne pentru semnătura pe hârtie.'
    : stale
      ? 'Persoana căreia i s-a cerut semnătura nu mai are acces. Alege alt semnatar sau semnătura pe hârtie.'
      : requested && !sent
        ? value
          ? 'La salvare, cererea trimisă se anulează și pleacă una nouă către persoana aleasă.'
          : 'La salvare, cererea trimisă se anulează; rubrica se semnează de mână, pe fișa tipărită.'
        : value
          ? 'Primește o cerere de semnare pe email sau prin SMS.'
          : 'Rubrica se semnează de mână, pe fișa tipărită.';
  return (
    <div className="grid gap-2">
      <Field id={id} label={label} hint={hint} error={error}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <NativeSelect
              id={id}
              data-testid={id}
              value={value}
              disabled={disabled || candidates === undefined}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : `${id}-hint`}
              onChange={(event) => onChange(event.target.value)}
            >
              <NativeSelectOption value="">Semnat pe hârtie</NativeSelectOption>
              {stale && (
                <NativeSelectOption value={value} disabled>
                  Semnatar care nu mai are acces
                </NativeSelectOption>
              )}
              {members.length > 0 && (
                <NativeSelectOptGroup label="Organizația ta">
                  {members.map((candidate) => (
                    <NativeSelectOption key={candidate.accountId} value={candidate.accountId}>
                      {candidateLabel(candidate)}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              )}
              {participants.length > 0 && (
                <NativeSelectOptGroup label="Clientul, în portal">
                  {participants.map((candidate) => (
                    <NativeSelectOption key={candidate.accountId} value={candidate.accountId}>
                      {candidateLabel(candidate)}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              )}
            </NativeSelect>
          </div>
          {sent && (
            <Badge variant="outline" data-testid={`${id}-requested`} className="shrink-0">
              cerere trimisă
            </Badge>
          )}
        </div>
      </Field>
      {mismatch && (
        <Notice
          variant="warning"
          data-testid={`${id}-mismatch`}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={`${id}-use-name`}
              disabled={disabled}
              onClick={() => onUseSignerName(mismatch.name)}
            >
              Folosește numele semnatarului
            </Button>
          }
        >
          {slotName.trim()
            ? `Rubrica tipărește „${slotName.trim()}”, dar semnează ${mismatch.name}. Semnătura se face pe numele contului, deci cele două trebuie să fie aceeași persoană.`
            : `Rubrica nu are încă un nume. Semnătura se face pe numele contului, ${mismatch.name}.`}
        </Notice>
      )}
    </div>
  );
}
