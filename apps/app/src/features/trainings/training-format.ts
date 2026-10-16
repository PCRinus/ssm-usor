import type { TrainingSource } from '@ssm-usor/contracts';

export function formatDuration(minutes: number) {
  return minutes % 60 === 0 ? `${minutes} min (${minutes / 60} h)` : `${minutes} min`;
}

export const trainingSourceLabels: Record<TrainingSource, string> = {
  app: 'Înregistrată în aplicație',
  paper: 'Preluată de pe fișa de hârtie',
};

export const formatPerson = (person: { name: string; jobTitle: string }) =>
  person.jobTitle ? `${person.name}, ${person.jobTitle}` : person.name;

export const attendeeCountLabel = (count: number) =>
  count === 1 ? '1 participant' : `${count} participanți`;
