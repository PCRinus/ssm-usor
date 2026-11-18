import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { toast } from '@ssm-usor/ui/lib/toast';
import {
  type ErrorComponentProps,
  getRouteApi,
  Link,
  useNavigate,
  useRouteContext,
} from '@tanstack/react-router';
import { Copy, LibraryBig, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  getGetJobPositionRiskEvaluationQueryKey,
  getGetRiskEvaluationQueryKey,
  getListJobPositionsQueryKey,
  useGetJobPositionRiskEvaluation,
  useGetRiskEvaluation,
  useListJobPositions,
  useRemoveRiskEvaluation,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { keepOpener } from '@/app/opener';
import { NotFound, RouteError } from '@/app/route-states';
import { useReturnToOpener } from '@/app/use-return-to-opener';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { CurrentClientHeaderFact } from '@/features/clients/client-fact';
import { HeaderFact, RecordHeader } from '@/features/clients/record-header';
import { ApplyProfileDialog } from '@/features/evaluation-profiles/apply-profile-dialog';
import { ProfileNameDialog } from '@/features/evaluation-profiles/profile-name-dialog';
import type { ProfileNaming } from '@/features/evaluation-profiles/profile-naming';
import { useSaveAsProfile } from '@/features/evaluation-profiles/use-save-as-profile';
import type { JobPosition } from '@/features/job-positions/job-position-schema';
import { positionSections } from '@/features/job-positions/position-sections';

import { CopyRiskFactorsDialog } from './copy-risk-factors-dialog';
import { evaluationFailure } from './evaluation-failure';
import { hasLibraryFactor } from './factor-origin';
import { OriginSummary } from './factor-origin-view';
import { useEvaluationFactorStore } from './factor-store';
import { LibraryNudge } from './library-nudge';
import { RiskEvaluationBack } from './risk-evaluation-back';
import { RiskEvaluationPending } from './risk-evaluation-pending';
import {
  clientEvaluationsSection,
  evaluationSections as sections,
  evaluationTitle,
  factorCountLabel,
  type RiskEvaluation,
} from './risk-evaluation-schema';
import { RiskFactorsCard } from './risk-factors-card';
import { RiskResultCard } from './risk-result-card';
import { useEvaluationCache } from './use-evaluation-cache';
import { useFactorListView } from './use-factor-list-view';
import { useLibraryNudge } from './use-library-nudge';
import { useStartEvaluation } from './use-start-evaluation';
import { WorkSystemCard } from './work-system-card';
import { useEvaluationWorkSystemStore } from './work-system-store';

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');
const positionRoute = getRouteApi('/_authenticated/clienti/$clientId/posturi/$jobPositionId');
const clientLevelRoute = getRouteApi(
  '/_authenticated/clienti/$clientId/posturi/fise-de-evaluare/$evaluationId'
);

function useReadOnly() {
  return clientRoute.useLoaderData().client.archivedAt !== null;
}

function useQueryAccess() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return {
    apiRequest,
    userId: session?.user.id ?? '',
    enabled: Boolean(session && apiRequest.baseUrl),
  };
}

export function PositionRiskEvaluationPage() {
  const { clientId, jobPositionId } = positionRoute.useParams();
  const readOnly = useReadOnly();
  const { apiRequest, userId, enabled } = useQueryAccess();
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId], enabled },
  });
  const query = useGetJobPositionRiskEvaluation(clientId, jobPositionId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetJobPositionRiskEvaluationQueryKey(clientId, jobPositionId), userId],
      enabled,
    },
  });
  const position = positions.data?.items.find((item) => item.id === jobPositionId);
  if (!position || !query.data) return <RiskEvaluationPending />;
  const { evaluation } = query.data;

  const facts = (
    <>
      <HeaderFact label="Post">
        <Link
          to="/clienti/$clientId/posturi/$jobPositionId"
          params={{ clientId, jobPositionId }}
          data-testid="risk-evaluation-header-position"
          className="hover:underline"
        >
          {position.name}
        </Link>
      </HeaderFact>
      <CurrentClientHeaderFact />
    </>
  );

  if (!evaluation) {
    return (
      <div data-testid="risk-evaluation-page" className="grid gap-5">
        <Header title={position.name} facts={facts} />
        <PositionNotEvaluated clientId={clientId} position={position} readOnly={readOnly} />
      </div>
    );
  }

  return (
    <RiskEvaluationView
      evaluation={evaluation}
      position={position}
      userId={userId}
      readOnly={readOnly}
      afterRemove={{
        to: '/clienti/$clientId/posturi/$jobPositionId',
        params: { clientId, jobPositionId },
        hash: positionSections.riskEvaluation,
      }}
      facts={facts}
    />
  );
}

export function ClientRiskEvaluationPage() {
  const { clientId, evaluationId } = clientLevelRoute.useParams();
  const readOnly = useReadOnly();
  const { apiRequest, userId, enabled } = useQueryAccess();
  const query = useGetRiskEvaluation(clientId, evaluationId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetRiskEvaluationQueryKey(clientId, evaluationId), userId],
      enabled,
    },
  });
  const evaluation = query.data?.evaluation;
  if (!evaluation) {
    return query.isError ? <RiskEvaluationNotFound /> : <RiskEvaluationPending />;
  }
  return (
    <RiskEvaluationView
      evaluation={evaluation}
      userId={userId}
      readOnly={readOnly}
      afterRemove={{
        to: '/clienti/$clientId/posturi',
        params: { clientId },
        hash: clientEvaluationsSection,
      }}
      facts={<CurrentClientHeaderFact />}
    />
  );
}

function PositionNotEvaluated({
  clientId,
  position,
  readOnly,
}: {
  clientId: string;
  position: JobPosition;
  readOnly: boolean;
}) {
  const { start, pending, failure } = useStartEvaluation(clientId, { onSheet: true });
  return (
    <>
      {failure && (
        <Notice variant="destructive" data-testid="risk-evaluation-start-error">
          {failure.message}
        </Notice>
      )}
      <Notice
        variant="warning"
        data-testid="risk-evaluation-missing"
        action={
          !readOnly && (
            <Button
              variant="outline"
              size="sm"
              className="border-warning-border bg-card"
              data-testid="risk-evaluation-start"
              disabled={pending}
              onClick={() => void start({ kind: 'job_position', jobPositionId: position.id })}
            >
              {pending ? 'Se pornește…' : 'Începe evaluarea'}
            </Button>
          )
        }
      >
        {readOnly
          ? 'Postul nu a fost evaluat. Clientul este arhivat, așa că nu se mai evaluează.'
          : 'Postul nu a fost evaluat încă. Evaluarea riscurilor și planul de prevenire se generează din fișele de evaluare a riscurilor ale posturilor.'}
      </Notice>
    </>
  );
}

function Header({
  title,
  facts,
  actions,
}: {
  title: string;
  facts: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <RecordHeader
      back={<RiskEvaluationBack />}
      title={`Fișa de evaluare a riscurilor · ${title}`}
      titleAside={
        <HelpLink topic="evaluari-de-risc.fisa" label="Ajutor: fișa de evaluare a riscurilor" />
      }
      facts={facts}
      actions={actions}
    />
  );
}

type AfterRemove =
  | {
      to: '/clienti/$clientId/posturi/$jobPositionId';
      params: { clientId: string; jobPositionId: string };
      hash: string;
    }
  | { to: '/clienti/$clientId/posturi'; params: { clientId: string }; hash: string };

function RiskEvaluationView({
  evaluation,
  position,
  userId,
  readOnly,
  afterRemove,
  facts,
}: {
  evaluation: RiskEvaluation;
  position?: JobPosition;
  userId: string;
  readOnly: boolean;
  afterRemove: AfterRemove;
  facts: ReactNode;
}) {
  const [removing, setRemoving] = useState(false);
  const [naming, setNaming] = useState<ProfileNaming | null>(null);
  const saveAsProfile = useSaveAsProfile(evaluation.clientId);
  const nudge = useLibraryNudge(evaluation, readOnly);
  const store = useEvaluationFactorStore(evaluation);
  const workSystemStore = useEvaluationWorkSystemStore(evaluation);
  const view = useFactorListView(evaluation.factors, sections.factors);
  const saveToLibrary = () => setNaming(saveAsProfile(evaluation));
  const canSave = evaluation.factors.length > 0 && !nudge.shown;
  return (
    <div data-testid="risk-evaluation-page" className="grid gap-5">
      <Header
        title={evaluationTitle(evaluation)}
        facts={facts}
        actions={
          (canSave || !readOnly) && (
            <>
              {canSave && (
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="risk-evaluation-save-as-profile"
                  onClick={saveToLibrary}
                >
                  <LibraryBig aria-hidden="true" />
                  Salvează în bibliotecă…
                </Button>
              )}
              {!readOnly && (
                <Button
                  variant="destructive-outline"
                  size="sm"
                  data-testid="risk-evaluation-remove"
                  onClick={() => setRemoving(true)}
                >
                  <Trash2 aria-hidden="true" />
                  Șterge fișa…
                </Button>
              )}
            </>
          )
        }
      />
      <RiskResultCard id={sections.result} evaluation={evaluation} view={view} headingLevel={2} />
      <WorkSystemCard
        id={sections.workSystem}
        workSystem={evaluation}
        store={workSystemStore}
        position={position}
        readOnly={readOnly}
        headingLevel={2}
      />
      <RiskFactorsCard
        id={sections.factors}
        factors={evaluation.factors}
        store={store}
        readOnly={readOnly}
        view={view}
        tools={<FactorSources evaluation={evaluation} userId={userId} />}
        description={
          hasLibraryFactor(evaluation.factors) && <OriginSummary factors={evaluation.factors} />
        }
        footer={nudge.shown && <LibraryNudge onSave={saveToLibrary} onDismiss={nudge.dismiss} />}
        empty={
          readOnly
            ? 'Fișa nu are factori de risc.'
            : 'Adaugă un factor de risc, aplică o evaluare din bibliotecă sau copiază factorii altei fișe.'
        }
        removalConsequence="nu vor mai apărea în fișă și în planul de prevenire."
        editorContext={evaluationTitle(evaluation)}
        clientId={evaluation.clientId}
        headingLevel={2}
      />
      <ProfileNameDialog naming={naming} onClose={() => setNaming(null)} />
      <RemoveEvaluationDialog
        evaluation={evaluation}
        open={removing}
        onClose={() => setRemoving(false)}
        afterRemove={afterRemove}
      />
    </div>
  );
}

function FactorSources({ evaluation, userId }: { evaluation: RiskEvaluation; userId: string }) {
  const [source, setSource] = useState<'profile' | 'evaluation' | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        data-testid="risk-factors-apply-profile"
        onClick={() => setSource('profile')}
      >
        <LibraryBig aria-hidden="true" />
        Aplică din bibliotecă
      </Button>
      <Button
        variant="secondary"
        size="sm"
        data-testid="risk-factors-copy"
        onClick={() => setSource('evaluation')}
      >
        <Copy aria-hidden="true" />
        Copiază de la altă fișă
      </Button>
      <ApplyProfileDialog
        evaluation={evaluation}
        userId={userId}
        open={source === 'profile'}
        onClose={() => setSource(null)}
      />
      <CopyRiskFactorsDialog
        evaluation={evaluation}
        userId={userId}
        open={source === 'evaluation'}
        onClose={() => setSource(null)}
      />
    </>
  );
}

function RemoveEvaluationDialog({
  evaluation,
  open,
  onClose,
  afterRemove,
}: {
  evaluation: RiskEvaluation;
  open: boolean;
  onClose: () => void;
  afterRemove: AfterRemove;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const returnToOpener = useReturnToOpener();
  const cache = useEvaluationCache(evaluation.clientId);
  const remove = useRemoveRiskEvaluation({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);
  const count = evaluation.factors.length;

  async function removeEvaluation() {
    setError(null);
    try {
      await remove.mutateAsync({ clientId: evaluation.clientId, evaluationId: evaluation.id });
    } catch (cause) {
      if (!(cause instanceof ApiHttpError && cause.status === 404)) {
        setError(
          evaluationFailure(
            cause,
            'Nu am putut șterge fișa. Verifică conexiunea și încearcă din nou.'
          )
        );
        return;
      }
    }
    toast.success('Fișa de evaluare a riscurilor a fost ștearsă.');
    // The sheet is gone, so its entry is replaced rather than left for the browser's back.
    if (!returnToOpener()) await navigate({ ...afterRemove, replace: true, state: keepOpener });
    await cache.removed(evaluation);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !remove.isPending && onClose()}>
      <DialogContent data-testid="risk-evaluation-remove-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ștergi fișa de evaluare a riscurilor?</DialogTitle>
          <DialogDescription>
            {count === 0
              ? 'Fișa nu are factori de risc.'
              : `${factorCountLabel(count)} și măsurile ${count === 1 ? 'lui' : 'lor'} se șterg odată cu ea.`}{' '}
            {evaluation.kind === 'other'
              ? 'Nu va mai apărea în evaluarea riscurilor și în planul de prevenire.'
              : 'Documentația nu se mai poate genera până nu o refaci.'}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Notice variant="destructive" data-testid="risk-evaluation-remove-error">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-2">
          <Button variant="ghost" disabled={remove.isPending} onClick={onClose}>
            Renunță
          </Button>
          <Button
            variant="destructive"
            data-testid="risk-evaluation-remove-confirm"
            disabled={remove.isPending}
            onClick={() => void removeEvaluation()}
          >
            {remove.isPending ? 'Se șterge…' : 'Șterge fișa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RiskEvaluationNotFound() {
  const { clientId } = clientRoute.useParams();
  return (
    <NotFound
      testId="risk-evaluation-not-found"
      title="Fișa de evaluare a riscurilor nu a fost găsită"
      description="Nu există nicio fișă de evaluare a riscurilor cu acest identificator la acest client, sau a fost ștearsă."
      action={
        <Button size="lg" asChild>
          <Link to="/clienti/$clientId/posturi" params={{ clientId }}>
            Înapoi la posturi
          </Link>
        </Button>
      }
    />
  );
}

export function RiskEvaluationError({ error }: ErrorComponentProps) {
  return (
    <RouteError
      error={error}
      testId="risk-evaluation-error"
      title="Fișa de evaluare a riscurilor nu a putut fi încărcată"
      retryTestId="risk-evaluation-retry"
      back={<RiskEvaluationBack />}
    />
  );
}
