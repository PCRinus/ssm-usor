import type { RouteHandler } from '@hono/zod-openapi';
import {
  type SetupErrorReason,
  type SetupField,
  type SetupGuide,
  type SetupLock,
  type SetupStep,
  type SetupStepId,
  setupStepIds,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type {
  getSetupGuideRoute,
  skipSetupStepRoute,
  unskipSetupStepRoute,
  updateSetupGuideRoute,
} from './routes';

// The generated types miss that the furthest client is null for an organization without one.
type Progress = Omit<
  Database['public']['Functions']['setup_progress']['Returns'][number],
  'furthest_client_id'
> & { furthest_client_id: string | null };

const isDone: Record<SetupStepId, (progress: Progress) => boolean> = {
  account: () => true,
  company: (p) => p.company_done,
  authorizations: (p) => p.authorizations_done,
  'professional-title': (p) => p.professional_title_done,
  client: (p) => p.client_done,
  'workplaces-positions': (p) => p.workplaces_positions_done,
  employees: (p) => p.employees_done,
  'responsible-persons': (p) => p.responsible_persons_done,
  'risk-evaluation': (p) => p.risk_evaluation_done,
  'fire-safety-data': (p) => p.fire_safety_data_done,
  'generate-sets': (p) => p.generate_sets_done,
  'issue-document': (p) => p.issue_document_done,
  'portal-invitation': (p) => p.portal_invitation_done,
  training: (p) => p.training_done,
  signature: (p) => p.signature_done,
};

const needsClient = (p: Progress): SetupLock | undefined =>
  p.has_client ? undefined : 'needs-client';
const needsEmployee = (p: Progress): SetupLock | undefined =>
  p.has_client_with_employee ? undefined : 'needs-employee';

const lockOf: Partial<Record<SetupStepId, (progress: Progress) => SetupLock | undefined>> = {
  'workplaces-positions': needsClient,
  'responsible-persons': needsClient,
  'fire-safety-data': needsClient,
  employees: (p) =>
    p.has_client_with_workplace_and_position ? undefined : 'needs-workplace-and-position',
  'risk-evaluation': (p) => (p.has_client_with_position ? undefined : 'needs-position'),
  // The organization's data first: a specialist cannot fill it, and waits for an owner.
  'generate-sets': (p) => {
    if (!p.company_done || !p.authorizations_done) return 'needs-organization-data';
    return p.has_client_with_basic_data ? undefined : 'needs-basic-data';
  },
  'issue-document': (p) => (p.has_draft_revision ? undefined : 'needs-draft'),
  'portal-invitation': needsEmployee,
  training: needsEmployee,
  signature: (p) => (p.has_training_record ? undefined : 'needs-training-record'),
};

const fieldsOf: Partial<Record<SetupStepId, [SetupField, keyof Progress][]>> = {
  company: [
    ['legal-name', 'legal_name_filled'],
    ['cui', 'cui_filled'],
    ['address', 'address_filled'],
    ['representative-name', 'representative_name_filled'],
    ['representative-role', 'representative_role_filled'],
  ],
  authorizations: [
    ['certificate', 'certificate_filled'],
    ['fire-safety-technician', 'fire_safety_technician_filled'],
  ],
};

const organizationSteps = new Set<SetupStepId>(['company', 'authorizations']);

function toStep(
  id: SetupStepId,
  progress: Progress,
  skipped: ReadonlySet<string>,
  isOwner: boolean
): SetupStep {
  const canDo = isOwner || !organizationSteps.has(id);
  if (isDone[id](progress)) return { id, state: 'done', canDo };
  const fields = fieldsOf[id];
  const missing = fields?.filter(([, filled]) => !progress[filled]).map(([field]) => field);
  const extra = missing ? { missing } : {};
  if (skipped.has(id)) return { id, state: 'skipped', canDo, ...extra };
  const lock = lockOf[id]?.(progress);
  if (lock) return { id, state: 'locked', canDo, lock, ...extra };
  return { id, state: 'open', canDo, ...extra };
}

async function loadSetupGuide(c: Context<ApiEnv>): Promise<SetupGuide> {
  const db = createDataClient(c);
  const userId = c.get('user').id;

  const [progress, profile, skips] = await Promise.all([
    db.rpc('setup_progress').maybeSingle(),
    db
      .from('profiles')
      .select('setup_guide_closed_at, setup_guide_finished_at')
      .eq('user_id', userId)
      .maybeSingle(),
    db.from('setup_step_skips').select('step').eq('user_id', userId),
  ]);
  if (progress.error) throw fromDatabaseError(progress.error, 'setup progress');
  if (profile.error) throw fromDatabaseError(profile.error, 'setup guide profile');
  if (skips.error) throw fromDatabaseError(skips.error, 'setup step skips');
  if (!progress.data) {
    throw new ApiError('forbidden', 'This account is not a member of an organization.');
  }

  const row = progress.data as Progress;
  const skipped = new Set(skips.data.map(({ step }) => step));
  const isOwner = c.get('membership').role === 'owner';
  const steps = setupStepIds.map((id) => toStep(id, row, skipped, isOwner));

  return {
    steps,
    next: steps.find((step) => step.state === 'open' && step.canDo)?.id ?? null,
    clientId: row.furthest_client_id,
    ownerName: row.owner_names.length === 1 ? row.owner_names[0]! : null,
    organizationHasClients: row.has_client,
    closed: Boolean(profile.data?.setup_guide_closed_at),
    finished: Boolean(profile.data?.setup_guide_finished_at),
  };
}

export const getSetupGuide: RouteHandler<typeof getSetupGuideRoute, ApiEnv> = async (c) =>
  c.json(await loadSetupGuide(c), 200);

export const updateSetupGuide: RouteHandler<typeof updateSetupGuideRoute, ApiEnv> = async (c) => {
  const { closed, finished } = c.req.valid('json');
  const now = new Date().toISOString();
  const changes: Database['public']['Tables']['profiles']['Update'] = {};
  if (closed !== undefined) changes.setup_guide_closed_at = closed ? now : null;
  if (finished !== undefined) changes.setup_guide_finished_at = finished ? now : null;

  if (Object.keys(changes).length > 0) {
    const { data, error } = await createDataClient(c)
      .from('profiles')
      .update(changes)
      .eq('user_id', c.get('user').id)
      .select('user_id');
    if (error) throw fromDatabaseError(error, 'setup guide update');
    if (data.length === 0) {
      throw new ApiError(
        'conflict',
        'The account has no profile yet.',
        undefined,
        'profile_missing' satisfies SetupErrorReason
      );
    }
  }

  return c.json(await loadSetupGuide(c), 200);
};

const uniqueViolation = '23505';

export const skipSetupStep: RouteHandler<typeof skipSetupStepRoute, ApiEnv> = async (c) => {
  const { step } = c.req.valid('param');

  const { error } = await createDataClient(c)
    .from('setup_step_skips')
    .insert({ user_id: c.get('user').id, step });
  if (error && error.code !== uniqueViolation) throw fromDatabaseError(error, 'setup step skip');

  return c.json(await loadSetupGuide(c), 200);
};

export const unskipSetupStep: RouteHandler<typeof unskipSetupStepRoute, ApiEnv> = async (c) => {
  const { step } = c.req.valid('param');

  const { error } = await createDataClient(c)
    .from('setup_step_skips')
    .delete()
    .eq('user_id', c.get('user').id)
    .eq('step', step);
  if (error) throw fromDatabaseError(error, 'setup step unskip');

  return c.json(await loadSetupGuide(c), 200);
};
