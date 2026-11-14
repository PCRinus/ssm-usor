import {
  type AnswerPeriod,
  answerRoles,
  type HandoverWindow,
  type TrainingDomain,
  trainingDomainLabels,
  type WhoTrainedAnswer,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { type ReactNode, useState } from 'react';

import { Masked } from '@/components/replay';
import { roCount } from '@/features/employees/employee-format';
import { notOnSheet } from '@/features/trainings/training-format';

import {
  type Changes,
  type Person,
  personName,
  resolveField,
  type ReviewContext,
} from './employee-review-model';
import { dateLabel } from './review-format';
import { copyCandidates, personText, roleLabels, withAnswerCopied } from './who-trained-model';

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-[13px] font-semibold text-muted-foreground">{title}</h3>
      <ul className="grid gap-0.5">{children}</ul>
    </section>
  );
}

export function WhoTrainedOthers({
  context,
  person,
  domain,
  answer,
  window,
  onClose,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  domain: TrainingDomain;
  answer: WhoTrainedAnswer;
  window: HandoverWindow;
  onClose: () => void;
  onChange: (mutate: (current: Changes) => Changes) => void;
}) {
  const candidates = copyCandidates(context, person, domain);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(candidates.open.filter((each) => each.samePost).map((each) => each.person.id))
  );
  const samePost = candidates.open.filter((each) => each.samePost);
  const otherPosts = candidates.open.filter((each) => !each.samePost);
  const post = resolveField(context, person, 'jobTitle').value;
  const split = window.splitOn;
  const periods: AnswerPeriod[] = split ? ['before', 'from'] : ['from'];
  const before =
    window.previousOn === null
      ? `până la ${dateLabel(split ?? '')}`
      : `de la ${dateLabel(window.previousOn)} până la ${dateLabel(split ?? '')}`;

  const toggle = (id: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const row = (other: Person) => {
    const id = `who-trained-copy-${other.id}`;
    const title = resolveField(context, other, 'jobTitle').value;
    return (
      <li key={other.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
        <Checkbox
          id={id}
          checked={ticked.has(other.id)}
          onCheckedChange={(checked) => toggle(other.id, checked === true)}
        />
        <label htmlFor={id} className="flex min-w-0 flex-wrap gap-x-2 text-sm">
          <Masked className="font-medium">{personName(context, other)}</Masked>
          {title !== null && <span className="text-muted-foreground">{String(title)}</span>}
        </label>
      </li>
    );
  };

  const apply = () => {
    onChange((current) =>
      withAnswerCopied({ ...context, changes: current }, person, domain, [...ticked])
    );
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="who-trained-others">
        <DialogHeader>
          <DialogTitle>Folosește același răspuns și la alți lucrători</DialogTitle>
          <DialogDescription>
            Instruire {trainingDomainLabels[domain]}, ca la{' '}
            <Masked>{personName(context, person)}</Masked>. Bifează doar lucrătorii instruiți de
            aceiași oameni.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4 grid gap-4">
          <dl className="grid gap-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
            {answerRoles(domain).map((role) => (
              <div key={role} className="grid gap-x-3 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
                <dt className="text-muted-foreground">{roleLabels[role]}</dt>
                <dd className="grid min-w-0">
                  {periods.map((period) => {
                    const chosen = answer[role]?.[period];
                    return (
                      <span key={period}>
                        {split && (
                          <span className="text-muted-foreground tabular-nums">
                            {period === 'before' ? before : `de la ${dateLabel(split)}`}:{' '}
                          </span>
                        )}
                        {chosen ? <Masked>{personText(chosen)}</Masked> : notOnSheet.name}
                      </span>
                    );
                  })}
                </dd>
              </div>
            ))}
          </dl>
          {samePost.length > 0 && (
            <Section title={`Același post${post !== null ? `, ${String(post)}` : ''}`}>
              {samePost.map(({ person: other }) => row(other))}
            </Section>
          )}
          {otherPosts.length > 0 && (
            <Section title="Alte posturi">
              {otherPosts.map(({ person: other }) => row(other))}
            </Section>
          )}
          {candidates.answered.length > 0 && (
            <Section title="Au deja răspunsul lor">
              {candidates.answered.map((other) => (
                <li key={other.id} className="px-1 py-1.5 text-sm text-muted-foreground">
                  <Masked>{personName(context, other)}</Masked> · rămâne cum e
                </li>
              ))}
            </Section>
          )}
          {candidates.otherDates.length > 0 && (
            <Section title="Au altă dată a preluării pe fișe">
              {candidates.otherDates.map((other) => (
                <li key={other.id} className="px-1 py-1.5 text-sm text-muted-foreground">
                  <Masked>{personName(context, other)}</Masked> · rămâne cum e
                </li>
              ))}
            </Section>
          )}
          <p className="text-[13px] text-muted-foreground">
            Fiecare îl poate schimba apoi pe pagina lui. Cât nu îl schimbă, urmează răspunsul de
            aici.
          </p>
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Renunță
          </Button>
          <Button
            type="button"
            disabled={ticked.size === 0}
            data-testid="who-trained-others-apply"
            onClick={apply}
          >
            {ticked.size === 0
              ? 'Folosește'
              : `Folosește la ${ticked.size === 1 ? 'un lucrător' : roCount(ticked.size, 'lucrător', 'lucrători')}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
