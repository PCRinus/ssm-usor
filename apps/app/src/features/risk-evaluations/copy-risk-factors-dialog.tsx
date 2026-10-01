import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getListRiskEvaluationsQueryKey,
  useCopyRiskFactors,
  useListRiskEvaluations,
} from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { evaluationFailure } from './evaluation-failure';
import { evaluationTitle, factorCountLabel, type RiskEvaluation } from './risk-evaluation-schema';
import { useEvaluationCache } from './use-evaluation-cache';

export function CopyRiskFactorsDialog({
  evaluation,
  userId,
  open,
  onClose,
}: {
  evaluation: RiskEvaluation;
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const cache = useEvaluationCache(evaluation.clientId);
  const evaluations = useListRiskEvaluations(evaluation.clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getListRiskEvaluationsQueryKey(evaluation.clientId), userId],
      enabled: open,
    },
  });
  const copy = useCopyRiskFactors({ request: apiRequest });
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sources = (evaluations.data?.items ?? []).filter(
    (candidate) => candidate.id !== evaluation.id && candidate.factorCount > 0
  );

  function close() {
    setSource('');
    setError(null);
    onClose();
  }

  async function copyFactors() {
    setError(null);
    try {
      const result = await copy.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        data: { fromEvaluationId: source },
      });
      await cache.saved(result.evaluation);
      savedToast(
        `Evaluarea are acum ${factorCountLabel(result.evaluation.factors.length).toLowerCase()}.`
      );
      close();
    } catch (cause) {
      setError(
        evaluationFailure(
          cause,
          'Nu am putut copia factorii. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !copy.isPending && close()}>
      <DialogContent data-testid="risk-factors-copy-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiază factorii altei evaluări</DialogTitle>
          <DialogDescription>
            Factorii evaluării alese, cu clasele și măsurile lor, se adaugă după cei pe care{' '}
            <span className="font-medium text-foreground">{evaluationTitle(evaluation)}</span> îi
            are deja. Ajustează apoi clasele la acest loc de muncă.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          {error && (
            <Notice variant="destructive" data-testid="risk-factors-copy-error">
              {error}
            </Notice>
          )}
          {evaluations.isError ? (
            <Notice variant="destructive">Nu am putut încărca evaluările clientului.</Notice>
          ) : evaluations.data && sources.length === 0 ? (
            <Notice variant="info" data-testid="risk-factors-copy-none">
              Nicio altă evaluare a clientului nu are factori încă.
            </Notice>
          ) : (
            <Field
              id="risk-factors-copy-source"
              label="Evaluarea de la care copiezi"
              mark="required"
            >
              <NativeSelect
                id="risk-factors-copy-source"
                data-testid="risk-factors-copy-source"
                className="w-full"
                value={source}
                disabled={copy.isPending || evaluations.isPending}
                onChange={(event) => setSource(event.target.value)}
              >
                <NativeSelectOption value="">Alege o evaluare…</NativeSelectOption>
                {sources.map((candidate) => (
                  <NativeSelectOption key={candidate.id} value={candidate.id}>
                    {`${evaluationTitle(candidate)} (${factorCountLabel(candidate.factorCount).toLowerCase()})`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={copy.isPending} onClick={close}>
            Renunță
          </Button>
          <Button
            type="button"
            data-testid="risk-factors-copy-confirm"
            disabled={copy.isPending || !source}
            onClick={() => void copyFactors()}
          >
            {copy.isPending ? 'Se copiază…' : 'Copiază'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
