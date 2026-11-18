import {
  countOf,
  type SignerSlot,
  signerSlotLabels,
  type TrainingSignatureState,
} from '@ssm-usor/contracts';

export function formatDuration(minutes: number) {
  return minutes % 60 === 0 ? `${minutes} min (${minutes / 60} h)` : `${minutes} min`;
}

// A training from the paper sheet is transcribed, an import being a faster way to transcribe:
// "preluare" names the handover note and the ANAF data, "sursa" an import's file (ADR 042).
export const transcribedLabel = 'Transcrisă de pe fișă';

export const trainingSignatureLabels = {
  pending: (count: number) => `${count} de semnat`,
  electronic: 'Semnată',
  paper: 'Semnată de mână',
} as const;

export const personSignatureLabels: Record<TrainingSignatureState, string> = {
  pending: 'De semnat',
  electronic: 'Semnat',
  paper: 'Semnat de mână',
};

export const ownSignatureLabels: Record<TrainingSignatureState, string> = {
  pending: 'De semnat',
  electronic: 'Semnată',
  paper: 'Semnată de mână',
};

// What a paper sheet does not write is said in words, never left blank (ADR 042).
export const notOnSheet = {
  name: 'nume neînscris pe fișă',
  material: 'necompletat pe fișă',
  duration: 'necompletată pe fișă',
} as const;

// The same slots the API's `recordSlots` gives a training held in the app.
export function paperSignedLine(record: { verifier: unknown; admission: unknown }) {
  const slots: SignerSlot[] = [
    'trainee',
    'trainer',
    ...(record.verifier ? (['verifier'] as const) : []),
    ...(record.admission ? (['admitter'] as const) : []),
  ];
  return `Semnat pe hârtie: ${slots.map((slot) => signerSlotLabels[slot].toLowerCase()).join(', ')}`;
}

export const attendeeCountLabel = (count: number) => countOf(count, 'participant', 'participanți');
