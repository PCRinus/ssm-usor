import type { TrainingTrainer } from '@ssm-usor/contracts';
import type { ReactNode } from 'react';

import { Masked } from '@/components/replay';

import { formatDuration, notOnSheet } from './training-format';

export function NotOnSheet({ children }: { children: ReactNode }) {
  return (
    <span data-testid="not-on-sheet" className="text-muted-foreground">
      {children}
    </span>
  );
}

export function TrainerName({ trainer }: { trainer: TrainingTrainer }) {
  const jobTitle = trainer.jobTitle ? `, ${trainer.jobTitle}` : '';
  if (trainer.name === null) {
    return (
      <>
        <NotOnSheet>{notOnSheet.name}</NotOnSheet>
        {jobTitle}
      </>
    );
  }
  return (
    <>
      <Masked>{trainer.name}</Masked>
      {jobTitle}
    </>
  );
}

export function PersonWithTitle({ person }: { person: { name: string; jobTitle: string } }) {
  return (
    <>
      <Masked>{person.name}</Masked>
      {person.jobTitle && `, ${person.jobTitle}`}
    </>
  );
}

// `named` where no column heading says what the value is.
export function TrainingDuration({ minutes, named }: { minutes: number | null; named?: boolean }) {
  if (minutes !== null) return <>{formatDuration(minutes)}</>;
  return (
    <>
      {named && 'Durata '}
      <NotOnSheet>{notOnSheet.duration}</NotOnSheet>
    </>
  );
}
