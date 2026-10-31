import { type SignerSlot, signerSlotLabels, type TrainingSource } from '@ssm-usor/contracts';

export function formatDuration(minutes: number) {
  return minutes % 60 === 0 ? `${minutes} min (${minutes / 60} h)` : `${minutes} min`;
}

export const trainingSourceLabels: Record<TrainingSource, string> = {
  app: 'Înregistrată în aplicație',
  paper: 'Preluată de pe fișa pe hârtie',
};

export const paperTrainingBadge = 'Transcris de pe fișa pe hârtie';

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

export const formatPerson = (person: { name: string; jobTitle: string }) =>
  person.jobTitle ? `${person.name}, ${person.jobTitle}` : person.name;

export const attendeeCountLabel = (count: number) =>
  count === 1 ? '1 participant' : `${count} participanți`;
