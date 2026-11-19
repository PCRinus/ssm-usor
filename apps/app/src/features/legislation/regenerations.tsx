import type { BuiltInDocumentTypeKey, DocumentSet } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { type Query, useQueries } from '@tanstack/react-query';
import { useLocation, useNavigate, useRouteContext } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  getGetDashboardSummaryQueryKey,
  getGetRegenerationJobQueryOptions,
  getListClientDocumentsQueryKey,
  getListClientsQueryKey,
  getListDocumentsBehindQueryKey,
  useStartDocumentRegeneration,
  useStartSetRegeneration,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';

import { documentsTabOf } from './legislation-sections';
import { type BehindType, finishedNotice, type RegenerationJob } from './regeneration-copy';
import { RegenerationToast } from './regeneration-toast';
import {
  type FinishedRegeneration,
  type JobProgress,
  type RegenerationBatch,
  regenerationJobQueryKey,
  type Regenerations,
  RegenerationsContext,
} from './regenerations-context';
import { behindSummaryQueryKey, useBehindSummary } from './use-behind-summary';

// Per account and organization: an admin acting as a member reads another organization, whose
// jobs this one's would never meet. Session storage keeps a batch through a reload, so its
// notice still counts every job it started.
const storageKey = (scope: string) => `ssm-usor:regenerations:${scope}`;

function readBatches(scope: string): RegenerationBatch[] {
  if (!scope) return [];
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey(scope)) ?? '[]') as unknown;
    return Array.isArray(stored) ? (stored as RegenerationBatch[]) : [];
  } catch {
    return [];
  }
}

function saveBatches(scope: string, batches: RegenerationBatch[]) {
  if (!scope) return;
  try {
    if (batches.length === 0) sessionStorage.removeItem(storageKey(scope));
    else sessionStorage.setItem(storageKey(scope), JSON.stringify(batches));
  } catch {
    return;
  }
}

// A job the caller can no longer read, deleted or of another organization, will not come back.
const unreadable = (error: unknown) =>
  error instanceof ApiHttpError && error.status >= 400 && error.status < 500;

// The applied list and each change's page count the documents still behind it.
const isLegalChangeQuery = (query: Query) =>
  typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/legislation/changes');

// Already under way, or nothing left to regenerate: neither is a type that failed to start.
function startNeedless(cause: unknown) {
  const reason =
    cause instanceof ApiHttpError && cause.status === 409 ? apiErrorReason(cause) : undefined;
  return reason === 'regeneration_running' || reason === 'nothing_behind';
}

const batchId = () =>
  `regeneration-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toastId = (batch: RegenerationBatch) => `regeneration:${batch.id}`;

const progressOfJob = (job: RegenerationJob): JobProgress => ({
  id: job.id,
  typeKey: job.typeKey,
  total: job.total,
  done: job.done,
  skipped: job.skipped,
  failed: job.failed,
  ended: true,
});

const noBatches: RegenerationBatch[] = [];
const noResults: Partial<Record<DocumentSet, FinishedRegeneration>> = {};

type Outcome = { job: RegenerationJob } | { gone: true } | { unread: true };

export function RegenerationsProvider({ children }: { children: ReactNode }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const me = useMe().data;
  const organizationId = me?.membership?.organization.id ?? '';
  // Jobs record the member a request acts as, the impersonated one while an admin acts as them.
  const memberId = me?.impersonation?.targetMemberId ?? userId;
  const scope = userId && organizationId ? `${userId}:${organizationId}` : '';
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const summary = useBehindSummary();
  const startType = useStartDocumentRegeneration({ request: apiRequest });
  const startSet = useStartSetRegeneration({ request: apiRequest });
  const [stored, setStored] = useState(() => ({ scope, batches: readBatches(scope) }));
  const [finished, setFinished] = useState<{
    scope: string;
    results: Partial<Record<DocumentSet, FinishedRegeneration>>;
  }>({ scope, results: {} });
  const announced = useRef(new Set<string>());
  const shownToasts = useRef(new Set<string>());

  if (stored.scope !== scope) setStored({ scope, batches: readBatches(scope) });
  if (finished.scope !== scope) setFinished({ scope, results: {} });
  const batches = stored.scope === scope ? stored.batches : noBatches;
  const results = finished.scope === scope ? finished.results : noResults;

  const running = summary.data?.running ?? [];
  const runningIds = new Set(running.map((job) => job.id));
  const left = batches.flatMap((batch) =>
    summary.dataUpdatedAt > batch.startedAt
      ? batch.jobIds.filter((jobId) => !runningIds.has(jobId))
      : []
  );
  const reads = useQueries({
    queries: left.map((jobId) =>
      getGetRegenerationJobQueryOptions(jobId, {
        request: apiRequest,
        query: {
          queryKey: regenerationJobQueryKey(jobId, userId),
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          retry: (count, error) => !unreadable(error) && count < 2,
        },
      })
    ),
  });
  const outcomes = new Map<string, Outcome>();
  left.forEach((jobId, index) => {
    const read = reads[index];
    if (read?.data) outcomes.set(jobId, { job: read.data.job });
    else if (read?.isError) {
      outcomes.set(jobId, unreadable(read.error) ? { gone: true } : { unread: true });
    }
  });

  const ended = batches.filter((batch) => batch.jobIds.every((jobId) => outcomes.has(jobId)));
  if (ended.length > 0) {
    setStored({ scope, batches: batches.filter((batch) => !ended.includes(batch)) });
    const next = { ...results };
    for (const batch of ended) {
      const jobs = batch.jobIds.flatMap((jobId) => {
        const outcome = outcomes.get(jobId)!;
        return 'job' in outcome ? [outcome.job] : [];
      });
      const unread = batch.jobIds.filter((jobId) => 'unread' in outcomes.get(jobId)!).length;
      if (jobs.length > 0 || unread > 0) next[batch.set] = { ...batch, jobs, unread };
    }
    setFinished({ scope, results: next });
  }

  useEffect(() => saveBatches(scope, batches), [scope, batches]);

  useEffect(() => {
    const toasts = shownToasts.current;
    return () => {
      toasts.forEach((id) => toast.dismiss(id));
      toasts.clear();
    };
  }, [scope]);

  const runningKey = running.map((job) => job.id).join(',');
  const previousRunning = useRef(runningKey);
  useEffect(() => {
    const now = new Set(runningKey.split(',').filter(Boolean));
    const gone = previousRunning.current.split(',').some((id) => id && !now.has(id));
    previousRunning.current = runningKey;
    if (!gone) return;
    void queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
    void queryClient.invalidateQueries({ predicate: isLegalChangeQuery });
  }, [runningKey, queryClient]);

  useEffect(() => {
    const fresh = Object.values(results).filter((batch) => !announced.current.has(batch.id));
    if (fresh.length === 0) return;
    fresh.forEach((batch) => announced.current.add(batch.id));
    void queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });
    void queryClient.invalidateQueries({ queryKey: behindSummaryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
    void queryClient.invalidateQueries({ predicate: isLegalChangeQuery });
    for (const client of new Set(
      fresh.flatMap((batch) => batch.jobs.flatMap((job) => job.items.map((item) => item.clientId)))
    )) {
      void queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(client) });
    }
    for (const batch of fresh) {
      const tab = documentsTabOf(batch.set);
      if (pathname === tab) continue;
      const notice = finishedNotice(batch.scope, batch.set, batch.jobs, batch.titles, batch.edited);
      const id = toastId(batch);
      shownToasts.current.add(id);
      toast.custom(
        () => (
          <RegenerationToast
            notice={notice}
            onOpen={() => {
              toast.dismiss(id);
              void navigate({ to: tab });
            }}
            onClose={() => toast.dismiss(id)}
          />
        ),
        { id, duration: Infinity }
      );
    }
  }, [results, pathname, queryClient, navigate]);

  useEffect(() => {
    for (const batch of Object.values(results)) {
      if (pathname === documentsTabOf(batch.set)) toast.dismiss(toastId(batch));
    }
  }, [pathname, results]);

  function begin(batch: Omit<RegenerationBatch, 'id' | 'startedAt'>) {
    setStored((current) => ({
      scope,
      batches: [
        ...current.batches
          .map((each) => ({
            ...each,
            jobIds: each.jobIds.filter((id) => !batch.jobIds.includes(id)),
          }))
          .filter((each) => each.jobIds.length > 0),
        { ...batch, id: batchId(), startedAt: summary.dataUpdatedAt },
      ],
    }));
    setFinished((current) => {
      const next = { ...current.results };
      delete next[batch.set];
      return { scope, results: next };
    });
    void queryClient.invalidateQueries({ queryKey: behindSummaryQueryKey() });
  }

  const edited = (types: readonly BehindType[]) =>
    types.flatMap((type) => type.clients).filter((client) => client.editedDraft).length;
  const titles = (types: readonly BehindType[]) =>
    Object.fromEntries(types.map((type) => [type.typeKey, type.title]));

  const value: Regenerations = {
    running: batches,
    finished: results,
    stalled: summary.isError && batches.length > 0,
    progressOf: (set) => {
      const live = running
        .filter((job) => job.set === set)
        .map((job): JobProgress => ({ ...job, ended: false }));
      const endedHere = batches
        .filter((batch) => batch.set === set)
        .flatMap((batch) => batch.jobIds)
        .flatMap((jobId) => {
          const outcome = outcomes.get(jobId);
          return outcome && 'job' in outcome ? [progressOfJob(outcome.job)] : [];
        });
      return [...live, ...endedHere.filter((job) => !runningIds.has(job.id))];
    },
    startOne: async (type) => {
      const { job } = await startType.mutateAsync({
        data: { typeKey: type.typeKey as BuiltInDocumentTypeKey },
      });
      begin({
        set: type.set,
        scope: 'one',
        jobIds: [job.id],
        titles: titles([type]),
        edited: edited([type]),
        notStarted: [],
      });
    },
    startAll: async (set, types) => {
      const answer = await startSet.mutateAsync({ data: { set } });
      begin({
        set,
        scope: 'all',
        jobIds: answer.jobs.map((job) => job.id),
        titles: titles(types),
        edited: edited(types),
        notStarted: answer.notStarted,
      });
    },
    startTypes: async (types) => {
      const notStarted: string[] = [];
      for (const set of new Set(types.map((type) => type.set))) {
        const ofSet = types.filter((type) => type.set === set);
        const jobIds: string[] = [];
        const refused: string[] = [];
        for (const type of ofSet) {
          try {
            const { job } = await startType.mutateAsync({
              data: { typeKey: type.typeKey as BuiltInDocumentTypeKey },
            });
            jobIds.push(job.id);
          } catch (cause) {
            if (!startNeedless(cause)) refused.push(type.typeKey);
          }
        }
        notStarted.push(...refused);
        if (jobIds.length > 0) {
          begin({
            set,
            scope: jobIds.length > 1 ? 'all' : 'one',
            jobIds,
            titles: titles(ofSet),
            edited: edited(ofSet),
            notStarted: refused,
          });
        }
      }
      return notStarted;
    },
    followRunning: async (set, types) => {
      const known = new Set(batches.flatMap((batch) => batch.jobIds));
      const { data } = await summary.refetch();
      const mine = (data?.running ?? []).filter(
        (job) => job.set === set && job.requestedBy === memberId && !known.has(job.id)
      );
      if (mine.length === 0) return false;
      begin({
        set,
        scope: mine.length > 1 ? 'all' : 'one',
        jobIds: mine.map((job) => job.id),
        titles: titles(types),
        edited: edited(types.filter((type) => mine.some((job) => job.typeKey === type.typeKey))),
        notStarted: [],
      });
      return true;
    },
    dismiss: (set) =>
      setFinished((current) => {
        const next = { ...current.results };
        delete next[set];
        return { scope: current.scope, results: next };
      }),
  };
  return <RegenerationsContext value={value}>{children}</RegenerationsContext>;
}
