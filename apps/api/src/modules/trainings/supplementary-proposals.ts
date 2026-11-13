import type {
  SupplementaryTrainingProposal,
  SupplementaryTrainingProposalPost,
  TrainingDomain,
} from '@ssm-usor/contracts';

import { type DataClient, everyRow, fromDatabaseError } from '../../lib/db';
import { collator } from '../../lib/romanian';
import { romanianDay } from '../documents/context';

const domainOrder: Record<TrainingDomain, number> = { ssm: 0, su: 1 };

type OpenProposal = {
  revisionId: string;
  domain: TrainingDomain;
  documentId: string;
  documentTitle: string;
  revision: number;
  documentDate: string;
  issuedAt: string;
};

type Post = { id: string; name: string; workerCount: number };

type RecordedTraining = {
  domain: TrainingDomain;
  createdAt: string;
  positionIds: Set<string>;
};

async function openProposals(db: DataClient, clientId: string): Promise<OpenProposal[]> {
  // Only the revision in force: a newer issue replaces the proposal of the one it supersedes.
  const { data, error } = await db
    .from('supplementary_training_proposals')
    .select(
      'revision_id, domain, document_id, issued_at, document_revisions!inner(revision, status, document_generations(issue_date)), client_documents!supplementary_training_proposals_document_fkey(title)'
    )
    .eq('client_id', clientId)
    .is('dismissed_at', null)
    .eq('document_revisions.status', 'issued');
  if (error) throw fromDatabaseError(error, 'list supplementary training proposals');
  return data.map((row) => ({
    revisionId: row.revision_id,
    domain: row.domain,
    documentId: row.document_id,
    documentTitle: row.client_documents.title,
    revision: row.document_revisions.revision,
    documentDate:
      row.document_revisions.document_generations?.issue_date ?? romanianDay(row.issued_at),
    issuedAt: row.issued_at,
  }));
}

async function earlierIssues(db: DataClient, documentIds: string[]) {
  const { data, error } = await db
    .from('document_revisions')
    .select('document_id')
    .in('document_id', documentIds)
    .eq('status', 'superseded');
  if (error) throw fromDatabaseError(error, 'read earlier issues');
  return new Set(data.map((row) => row.document_id));
}

async function postsWithCurrentWorkers(db: DataClient, clientId: string): Promise<Post[]> {
  // Counted by the database, one row per position, so a large client is not cut short by the
  // limit on rows a request returns.
  const { data, error } = await db
    .from('job_positions')
    .select('id, name, employees(count)')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .eq('employees.status', 'active')
    .is('employees.archived_at', null);
  if (error) throw fromDatabaseError(error, 'count current workers by position');
  return data
    .map((row) => ({ id: row.id, name: row.name, workerCount: row.employees[0]?.count ?? 0 }))
    .filter((post) => post.workerCount > 0)
    .sort((a, b) => b.workerCount - a.workerCount || collator.compare(a.name, b.name));
}

async function recordedSince(
  db: DataClient,
  clientId: string,
  since: string
): Promise<RecordedTraining[]> {
  const rows = await everyRow(
    (from, to) =>
      db
        .from('trainings')
        .select(
          'domain, created_at, training_records(employees(job_position_id, status, archived_at))'
        )
        .eq('client_id', clientId)
        .eq('phase', 'supplementary')
        .eq('supplementary_reason', 'rules_changed')
        .gte('created_at', since)
        .order('created_at')
        .order('id')
        .range(from, to),
    'list supplementary trainings since an issue'
  );
  return rows.map((row) => ({
    domain: row.domain,
    createdAt: row.created_at,
    positionIds: new Set(
      row.training_records.flatMap(({ employees: employee }) =>
        employee.status === 'active' && employee.archived_at === null
          ? [employee.job_position_id]
          : []
      )
    ),
  }));
}

/**
 * The open proposals of a client, occupational safety first: those not closed, of the revision
 * in force, with a post whose current workers have not had the training since the issue.
 */
export async function listSupplementaryTrainingProposals(
  db: DataClient,
  clientId: string
): Promise<SupplementaryTrainingProposal[]> {
  const proposals = await openProposals(db, clientId);
  if (proposals.length === 0) return [];
  const since = proposals.map((proposal) => proposal.issuedAt).sort()[0]!;
  const [earlier, posts, trainings] = await Promise.all([
    earlierIssues(
      db,
      proposals.map((proposal) => proposal.documentId)
    ),
    postsWithCurrentWorkers(db, clientId),
    recordedSince(db, clientId, since),
  ]);
  return proposals
    .map((proposal) => {
      const issuedAt = Date.parse(proposal.issuedAt);
      const recorded = trainings.filter(
        (training) =>
          training.domain === proposal.domain && Date.parse(training.createdAt) >= issuedAt
      );
      const proposalPosts: SupplementaryTrainingProposalPost[] = posts.map((post) => {
        const first = recorded.find((training) => training.positionIds.has(post.id));
        return {
          jobPositionId: post.id,
          name: post.name,
          workerCount: post.workerCount,
          recordedOn: first ? romanianDay(first.createdAt) : null,
        };
      });
      return {
        revisionId: proposal.revisionId,
        domain: proposal.domain,
        documentTitle: proposal.documentTitle,
        revision: proposal.revision,
        firstIssue: !earlier.has(proposal.documentId),
        documentDate: proposal.documentDate,
        issuedAt: proposal.issuedAt,
        posts: proposalPosts,
      };
    })
    .filter((proposal) => proposal.posts.some((post) => post.recordedOn === null))
    .sort((a, b) => domainOrder[a.domain] - domainOrder[b.domain]);
}

/** False when the client has no open proposal of that revision. */
export async function dismissSupplementaryTrainingProposal(
  db: DataClient,
  clientId: string,
  revisionId: string,
  userId: string
) {
  const { data, error } = await db
    .from('supplementary_training_proposals')
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
    .eq('client_id', clientId)
    .eq('revision_id', revisionId)
    .is('dismissed_at', null)
    .select('revision_id');
  if (error) throw fromDatabaseError(error, 'dismiss supplementary training proposal');
  return data.length > 0;
}
