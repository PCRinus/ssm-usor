import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { getListRiskEvaluationsQueryKey, useListRiskEvaluations } from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { DecisionBadge } from '@/features/job-positions/decision-badge';

import { EvaluationLink } from './evaluation-link';
import {
  clientEvaluationsSection,
  evaluationNameSchema,
  evaluationStateLabel,
  evaluationTitle,
  type RiskEvaluationSummary,
} from './risk-evaluation-schema';
import { useStartEvaluation } from './use-start-evaluation';

export function ClientRiskEvaluationsCard({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const evaluations = useListRiskEvaluations(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListRiskEvaluationsQueryKey(clientId), userId] },
  });
  const { start, pending, failure } = useStartEvaluation(clientId);
  const [adding, setAdding] = useState(false);
  const items = evaluations.data?.items ?? [];
  const sensitiveGroups = items.find((item) => item.kind === 'sensitive_groups') ?? null;
  const others = items.filter((item) => item.kind === 'other');

  return (
    <SectionCard
      id={clientEvaluationsSection}
      data-testid="client-risk-evaluations-card"
      title="Evaluări de risc în afara posturilor"
      description="Grupurile sensibile la riscuri specifice se evaluează ca un post; la fel orice altă categorie de persoane expuse, cum sunt vizitatorii."
      action={
        !readOnly && (
          <Button
            variant="outline"
            size="sm"
            data-testid="client-risk-evaluation-add"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden="true" />
            Adaugă o evaluare
          </Button>
        )
      }
    >
      {failure && (
        <Notice variant="destructive" data-testid="client-risk-evaluations-error">
          {failure.message}
        </Notice>
      )}
      {evaluations.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : evaluations.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={evaluations.isFetching}
              onClick={() => void evaluations.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca evaluările clientului.
        </Notice>
      ) : (
        <ul className="grid divide-y">
          {sensitiveGroups ? (
            <EvaluationRow evaluation={sensitiveGroups} />
          ) : (
            <Row
              title="Grupuri sensibile"
              state={<DecisionBadge decision={null}>Neevaluat</DecisionBadge>}
              action={
                !readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="sensitive-groups-start"
                    disabled={pending}
                    onClick={() => void start({ kind: 'sensitive_groups' })}
                  >
                    {pending ? 'Se pornește…' : 'Începe evaluarea'}
                  </Button>
                )
              }
            />
          )}
          {others.map((evaluation) => (
            <EvaluationRow key={evaluation.id} evaluation={evaluation} />
          ))}
        </ul>
      )}
      <AddEvaluationDialog clientId={clientId} open={adding} onClose={() => setAdding(false)} />
    </SectionCard>
  );
}

function Row({ title, state, action }: { title: ReactNode; state: ReactNode; action?: ReactNode }) {
  return (
    <li
      data-testid="client-risk-evaluation-row"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 text-sm"
    >
      <span className="min-w-0 font-medium wrap-anywhere">{title}</span>
      <span className="flex flex-wrap items-center gap-2">
        {state}
        {action}
      </span>
    </li>
  );
}

function EvaluationRow({ evaluation }: { evaluation: RiskEvaluationSummary }) {
  return (
    <Row
      title={
        <EvaluationLink
          evaluation={evaluation}
          className="hover:underline"
          data-testid="client-risk-evaluation-open"
        >
          {evaluationTitle(evaluation)}
        </EvaluationLink>
      }
      state={
        <DecisionBadge asChild decision={evaluation.factorCount > 0 || null}>
          <EvaluationLink evaluation={evaluation} data-testid="client-risk-evaluation-state">
            {evaluationStateLabel(evaluation)}
            <ChevronRight aria-hidden="true" />
          </EvaluationLink>
        </DecisionBadge>
      }
    />
  );
}

const nameFormSchema = z.object({ name: evaluationNameSchema });

function AddEvaluationDialog({
  clientId,
  open,
  onClose,
}: {
  clientId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <AddEvaluationForm clientId={clientId} onClose={onClose} />}
    </Dialog>
  );
}

function AddEvaluationForm({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { start, pending, failure } = useStartEvaluation(clientId);
  const form = useForm<z.infer<typeof nameFormSchema>>({
    resolver: zodResolver(nameFormSchema),
    defaultValues: { name: '' },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name }) => {
    await start({ kind: 'other', name: name.trim() });
  });
  const nameError =
    errors.name ?? (failure?.nameTaken ? { type: 'server', message: failure.message } : undefined);

  return (
    <DialogContent data-testid="client-risk-evaluation-dialog" className="sm:max-w-md">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={pending} noValidate>
        <DialogHeader>
          <DialogTitle>Adaugă o evaluare</DialogTitle>
          <DialogDescription>
            Pentru persoane expuse care nu ocupă un post al clientului. Grupurile sensibile au
            evaluarea lor.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-4">
          <Field
            id="client-risk-evaluation-name"
            label="Denumire"
            mark="required"
            hint="„Vizitatori”, „Personalul firmelor de curățenie”."
            error={nameError}
          >
            <Input
              id="client-risk-evaluation-name"
              data-testid="client-risk-evaluation-name"
              autoComplete="off"
              maxLength={160}
              disabled={pending}
              aria-invalid={Boolean(nameError)}
              aria-describedby={
                nameError ? 'client-risk-evaluation-name-error' : 'client-risk-evaluation-name-hint'
              }
              {...form.register('name')}
            />
          </Field>
          {failure && !failure.nameTaken && (
            <Notice variant="destructive" data-testid="client-risk-evaluation-dialog-error">
              {failure.message}
            </Notice>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="client-risk-evaluation-save" disabled={pending}>
            {pending ? 'Se adaugă…' : 'Adaugă și deschide'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
