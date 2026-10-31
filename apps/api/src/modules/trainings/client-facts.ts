import type {
  StaffCategory,
  TrainingDomain,
  TrainingPhase,
  TrainingProposal,
} from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import {
  fireSafetyTechnicianJobTitle,
  type ProposalPeople,
  type ProposalPerson,
  type ThemesRevision,
  trainingProposal,
} from './proposal';

export const themesTypeKeys: Record<TrainingDomain, string> = {
  ssm: 'training_themes',
  psi: 'fire_training_themes',
};

export const proposalPerson = (
  name: string | null | undefined,
  jobTitle: string | null | undefined,
  employeeId: string | null = null
): ProposalPerson | null =>
  name?.trim() ? { name: name.trim(), jobTitle: jobTitle?.trim() || null, employeeId } : null;

export interface ClientTrainingFacts {
  positions: ReadonlyMap<string, { name: string; staffCategory: StaffCategory }>;
  themes: Record<TrainingDomain, ThemesRevision | null>;
  people: ProposalPeople;
  periodicMinutes: Record<TrainingDomain, number | null>;
}

// `specialistUserId` is the specialist the proposal names: the member who asks, or whoever
// started an import.
export async function clientTrainingFacts(
  db: DataClient | AdminClient,
  input: { clientId: string; organizationId: string; specialistUserId: string | null }
): Promise<ClientTrainingFacts> {
  const { clientId } = input;
  const themesOf = (domain: TrainingDomain) =>
    db
      .from('document_revisions')
      .select('id, data_snapshot, client_documents!inner(client_id, type_key)')
      .eq('client_documents.client_id', clientId)
      .eq('client_documents.type_key', themesTypeKeys[domain])
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle();
  const [client, positions, profile, organization, manager, fireSafety, ssmThemes, psiThemes] =
    await Promise.all([
      db
        .from('clients')
        .select(
          'legal_representative_name, legal_representative_role, legal_representative_employee_id, periodic_training_minutes'
        )
        .eq('id', clientId)
        .maybeSingle(),
      db
        .from('job_positions')
        .select('id, name, staff_category')
        .eq('client_id', clientId)
        .is('archived_at', null),
      input.specialistUserId
        ? db
            .from('profiles')
            .select('full_name, professional_title')
            .eq('user_id', input.specialistUserId)
            .maybeSingle()
        : null,
      db
        .from('organizations')
        .select('fire_safety_technician_name')
        .eq('id', input.organizationId)
        .maybeSingle(),
      // The order people were designated in is the order the decisions list them in.
      db
        .from('client_responsible_persons')
        .select('full_name, job_title, employee_id')
        .eq('client_id', clientId)
        .contains('roles', ['workplace_manager'])
        .is('archived_at', null)
        .order('created_at')
        .order('id')
        .limit(1)
        .maybeSingle(),
      db
        .from('client_fire_safety')
        .select('periodic_training_hours')
        .eq('client_id', clientId)
        .maybeSingle(),
      themesOf('ssm'),
      themesOf('psi'),
    ]);
  for (const [result, context] of [
    [client, 'training facts: client'],
    [positions, 'training facts: job positions'],
    [profile, 'training facts: profile'],
    [organization, 'training facts: organization'],
    [manager, 'training facts: workplace manager'],
    [fireSafety, 'training facts: fire safety'],
    [ssmThemes, 'training facts: themes'],
    [psiThemes, 'training facts: fire themes'],
  ] as const) {
    if (result?.error) throw fromDatabaseError(result.error, context);
  }
  const revision = (row: { id: string; data_snapshot: unknown } | null) =>
    row?.data_snapshot ? { id: row.id, snapshot: row.data_snapshot } : null;
  const hours = fireSafety.data?.periodic_training_hours;
  return {
    positions: new Map(
      (positions.data ?? []).map((position) => [
        position.id,
        { name: position.name, staffCategory: position.staff_category },
      ])
    ),
    // An uploaded file has no data to propose from.
    themes: { ssm: revision(ssmThemes.data), psi: revision(psiThemes.data) },
    people: {
      specialist: proposalPerson(profile?.data?.full_name, profile?.data?.professional_title),
      workplaceManager: proposalPerson(
        manager.data?.full_name,
        manager.data?.job_title,
        manager.data?.employee_id ?? null
      ),
      legalRepresentative: proposalPerson(
        client.data?.legal_representative_name,
        client.data?.legal_representative_role,
        client.data?.legal_representative_employee_id ?? null
      ),
      fireSafetyTechnician: proposalPerson(
        organization.data?.fire_safety_technician_name,
        fireSafetyTechnicianJobTitle
      ),
    },
    periodicMinutes: {
      ssm: client.data?.periodic_training_minutes ?? null,
      psi: hours ? hours * 60 : null,
    },
  };
}

export function proposalFromFacts(
  facts: ClientTrainingFacts,
  query: {
    domain: TrainingDomain;
    phase: TrainingPhase;
    heldOn: string;
    jobPositionId: string | null;
  }
): TrainingProposal {
  return trainingProposal({
    domain: query.domain,
    phase: query.phase,
    heldOn: query.heldOn,
    position: query.jobPositionId ? (facts.positions.get(query.jobPositionId) ?? null) : null,
    themes: facts.themes[query.domain],
    people: facts.people,
    periodicMinutes: facts.periodicMinutes[query.domain],
  });
}
