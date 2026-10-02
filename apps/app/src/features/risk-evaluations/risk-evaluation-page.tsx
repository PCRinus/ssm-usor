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
  useRouter,
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
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { ApplyProfileDialog } from '@/features/evaluation-profiles/apply-profile-dialog';
import { ProfileNameDialog } from '@/features/evaluation-profiles/profile-name-dialog';
import type { ProfileNaming } from '@/features/evaluation-profiles/profile-naming';
import { useSaveAsProfile } from '@/features/evaluation-profiles/use-save-as-profile';
import type { JobPosition } from '@/features/job-positions/job-position-schema';
import { positionSections } from '@/features/job-positions/position-sections';

import { CopyRiskFactorsDialog } from './copy-risk-factors-dialog';
import { evaluationFailure } from './evaluation-failure';
import { useEvaluationFactorStore } from './factor-store';
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
import { useFactorFilter } from './use-factor-filter';
import { useStartEvaluation } from './use-start-evaluation';
import { WorkSystemCard } from './work-system-card';

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');
const positionRoute = getRouteApi('/_authenticated/clients/$clientId/job-positions/$jobPositionId');
const clientLevelRoute = getRouteApi(
  '/_authenticated/clients/$clientId/job-positions/risk-evaluations/$evaluationId'
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

  if (!evaluation) {
    return (
      <div data-testid="risk-evaluation-page" className="grid gap-5">
        <Header title={position.name} />
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
        to: '/clients/$clientId/job-positions/$jobPositionId',
        params: { clientId, jobPositionId },
        hash: positionSections.riskEvaluation,
      }}
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
        to: '/clients/$clientId/job-positions',
        params: { clientId },
        hash: clientEvaluationsSection,
      }}
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
  const { start, pending, failure } = useStartEvaluation(clientId);
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
          : 'Postul nu a fost evaluat încă. Evaluarea riscurilor și planul de prevenire se generează din evaluările posturilor.'}
      </Notice>
    </>
  );
}

function Header({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Evaluare de risc</p>
        <h2 className="text-xl font-semibold tracking-tight wrap-anywhere">{title}</h2>
      </div>
      {action}
    </div>
  );
}

type AfterRemove =
  | {
      to: '/clients/$clientId/job-positions/$jobPositionId';
      params: { clientId: string; jobPositionId: string };
      hash: string;
    }
  | { to: '/clients/$clientId/job-positions'; params: { clientId: string }; hash: string };

function RiskEvaluationView({
  evaluation,
  position,
  userId,
  readOnly,
  afterRemove,
}: {
  evaluation: RiskEvaluation;
  position?: JobPosition;
  userId: string;
  readOnly: boolean;
  afterRemove: AfterRemove;
}) {
  const [removing, setRemoving] = useState(false);
  const [naming, setNaming] = useState<ProfileNaming | null>(null);
  const saveAsProfile = useSaveAsProfile();
  const store = useEvaluationFactorStore(evaluation);
  const filter = useFactorFilter(evaluation.factors, sections.factors);
  return (
    <div data-testid="risk-evaluation-page" className="grid gap-5">
      <Header
        title={evaluationTitle(evaluation)}
        action={
          <div className="flex flex-wrap gap-2">
            {evaluation.factors.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                data-testid="risk-evaluation-save-as-profile"
                onClick={() => setNaming(saveAsProfile(evaluation))}
              >
                <LibraryBig aria-hidden="true" />
                Salvează ca profil…
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
                Șterge evaluarea…
              </Button>
            )}
          </div>
        }
      />
      <RiskResultCard id={sections.result} evaluation={evaluation} filter={filter} />
      <WorkSystemCard
        id={sections.workSystem}
        evaluation={evaluation}
        position={position}
        readOnly={readOnly}
      />
      <RiskFactorsCard
        id={sections.factors}
        factors={evaluation.factors}
        store={store}
        readOnly={readOnly}
        filter={filter}
        tools={<FactorSources evaluation={evaluation} userId={userId} />}
        empty={
          readOnly
            ? 'Evaluarea nu are factori de risc.'
            : 'Adaugă un factor de risc, aplică un profil din bibliotecă sau copiază factorii altei evaluări.'
        }
        removalConsequence="nu vor mai apărea în evaluare și în planul de prevenire."
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
        variant="outline"
        size="sm"
        data-testid="risk-factors-apply-profile"
        onClick={() => setSource('profile')}
      >
        <LibraryBig aria-hidden="true" />
        Aplică un profil
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="risk-factors-copy"
        onClick={() => setSource('evaluation')}
      >
        <Copy aria-hidden="true" />
        Copiază de la altă evaluare
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
            'Nu am putut șterge evaluarea. Verifică conexiunea și încearcă din nou.'
          )
        );
        return;
      }
    }
    toast.success('Evaluarea a fost ștearsă.');
    await navigate(afterRemove);
    await cache.removed(evaluation);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !remove.isPending && onClose()}>
      <DialogContent data-testid="risk-evaluation-remove-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ștergi evaluarea?</DialogTitle>
          <DialogDescription>
            {count === 0
              ? 'Evaluarea nu are factori de risc.'
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
            {remove.isPending ? 'Se șterge…' : 'Șterge evaluarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RiskEvaluationNotFound() {
  const { clientId } = clientRoute.useParams();
  return (
    <div data-testid="risk-evaluation-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h2 className="text-xl font-semibold tracking-tight">Evaluarea nu a fost găsită</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există nicio evaluare de risc cu acest identificator la acest client, sau a fost ștearsă.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clients/$clientId/job-positions" params={{ clientId }}>
          Înapoi la posturi
        </Link>
      </Button>
    </div>
  );
}

export function RiskEvaluationError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : 'Nu am putut încărca evaluarea de risc. Încearcă din nou.';
  return (
    <div
      data-testid="risk-evaluation-error"
      role="alert"
      className="mx-auto grid max-w-lg gap-5 py-14"
    >
      <h2 className="text-xl font-semibold tracking-tight">Evaluarea nu a putut fi încărcată</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button
        data-testid="risk-evaluation-retry"
        variant="outline"
        className="w-fit"
        onClick={() => void router.invalidate()}
      >
        Încearcă din nou
      </Button>
    </div>
  );
}
