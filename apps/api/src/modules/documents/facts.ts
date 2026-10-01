import {
  type CountyCode,
  countyNames,
  type EquipmentAllocation,
  type ResponsiblePersonRole,
  type StaffCategory,
} from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { DocumentFacts } from './context';
import type { RiskEvaluationFacts } from './risk-assessment';
import { snapshotAnnexes } from './snapshot';

// Row-level security scopes every query to the caller's organization.

export type StoredDocumentFacts = Omit<DocumentFacts, 'issueDate' | 'firstDecisionNumber'> & {
  clientArchived: boolean;
};

const moduleVersionsPath =
  'job_position_instructions.instruction_modules.instruction_module_versions';

export async function loadDocumentFacts(
  db: DataClient,
  clientId: string,
  // The member who prepares the documents: whoever generates them, unless told otherwise.
  specialistUserId: string
): Promise<StoredDocumentFacts> {
  const categories: StaffCategory[] = ['technical_administrative', 'execution'];
  const [
    client,
    organization,
    members,
    persons,
    headcount,
    generatedDecision,
    positions,
    ownInstructions,
    workplaces,
    riskEvaluations,
    ...employeeCounts
  ] = await Promise.all([
    db
      .from('clients')
      .select(
        'legal_name, legal_representative_name, legal_representative_role, periodic_training_minutes, administrative_training_interval_months, administrative_training_not_applicable, worker_training_interval_months, worker_training_not_applicable, training_first_month, training_day_from, training_day_to, caen_code, archived_at'
      )
      .eq('id', clientId)
      .maybeSingle(),
    // A member sees exactly one organization: their own.
    db
      .from('organizations')
      .select('legal_name, legal_representative_name, legal_representative_role')
      .single(),
    db.rpc('organization_member_list'),
    db
      .from('client_responsible_persons')
      .select('full_name, job_title, roles, employees(status, archived_at)')
      .eq('client_id', clientId)
      .is('archived_at', null)
      // The order people were designated in is the order the decisions list them in.
      .order('created_at')
      .order('id'),
    db
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'active')
      .is('archived_at', null),
    // A document row without a revision is a failed generation, not a generated document.
    db
      .from('client_documents')
      .select('id, document_revisions!inner(id)', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('type_key', 'decision_workers_representative'),
    // In the order of the positions table, with the entries in the order they were added.
    db
      .from('job_positions')
      .select(
        'id, name, staff_category, work_zone, activities, training_interval_months, needs_protective_equipment, needs_instructions, employees(id), job_position_equipment(risk, item, quantity, duration_months, allocation, created_at, id), job_position_instructions(module_id, instruction_modules(title, module_group, instruction_module_versions(id, number, created_at)))'
      )
      .eq('client_id', clientId)
      .is('archived_at', null)
      // Embedded filters narrow the embedded employees to the current ones, not the positions.
      .eq('employees.status', 'active')
      .is('employees.archived_at', null)
      .order('name')
      .order('id')
      .order('created_at', { referencedTable: 'job_position_equipment' })
      .order('id', { referencedTable: 'job_position_equipment' })
      // The current version of each applied module: the newest number, one row.
      .order('number', { referencedTable: moduleVersionsPath, ascending: false })
      .limit(1, { referencedTable: moduleVersionsPath }),
    loadOwnInstructions(db, clientId),
    db
      .from('client_workplaces')
      .select('name, is_registered_office, county_code, locality, address_line')
      .eq('client_id', clientId)
      .is('archived_at', null)
      .order('name')
      .order('id'),
    loadRiskEvaluations(db, clientId),
    ...categories.map((category) =>
      db
        .from('employees')
        .select('id, job_positions!inner(staff_category)', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'active')
        .is('archived_at', null)
        .eq('job_positions.staff_category', category)
    ),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'document facts: client');
  if (!client.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
  if (organization.error)
    throw fromDatabaseError(organization.error, 'document facts: organization');
  if (members.error) throw fromDatabaseError(members.error, 'document facts: members');
  if (persons.error) throw fromDatabaseError(persons.error, 'document facts: responsible persons');
  if (headcount.error) throw fromDatabaseError(headcount.error, 'document facts: employee count');
  if (generatedDecision.error) {
    throw fromDatabaseError(generatedDecision.error, 'document facts: generated decision 1.5');
  }
  if (positions.error) throw fromDatabaseError(positions.error, 'document facts: job positions');
  if (workplaces.error) throw fromDatabaseError(workplaces.error, 'document facts: workplaces');
  for (const count of employeeCounts) {
    if (count.error) throw fromDatabaseError(count.error, 'document facts: employee categories');
  }

  const specialist = members.data.find((member) => member.user_id === specialistUserId);
  return {
    // Every plan carries the line for now; the switch arrives with billing (docs/document-branding.md).
    branding: true,
    clientArchived: client.data.archived_at !== null,
    organization: {
      legalName: organization.data.legal_name,
      representativeName: organization.data.legal_representative_name,
      representativeRole: organization.data.legal_representative_role,
    },
    specialist: specialist
      ? { fullName: specialist.full_name, professionalTitle: specialist.professional_title }
      : null,
    client: {
      legalName: client.data.legal_name,
      representativeName: client.data.legal_representative_name,
      representativeRole: client.data.legal_representative_role,
      periodicTrainingMinutes: client.data.periodic_training_minutes,
      administrativeTrainingIntervalMonths: client.data.administrative_training_interval_months,
      administrativeTrainingNotApplicable: client.data.administrative_training_not_applicable,
      workerTrainingIntervalMonths: client.data.worker_training_interval_months,
      workerTrainingNotApplicable: client.data.worker_training_not_applicable,
      trainingFirstMonth: client.data.training_first_month,
      trainingDayFrom: client.data.training_day_from,
      trainingDayTo: client.data.training_day_to,
      caenCode: client.data.caen_code,
    },
    workplaces: workplaces.data.map((workplace) => ({
      name: workplace.name,
      registeredOffice: workplace.is_registered_office,
      county: workplace.county_code ? countyNames[workplace.county_code as CountyCode] : null,
      countyCode: workplace.county_code,
      locality: workplace.locality,
      addressLine: workplace.address_line,
    })),
    responsiblePersons: persons.data.map((person) => ({
      fullName: person.full_name,
      jobTitle: person.job_title,
      roles: person.roles as ResponsiblePersonRole[],
      currentEmployee:
        person.employees?.status === 'active' && person.employees.archived_at === null,
    })),
    jobPositions: positions.data.map((position) => ({
      id: position.id,
      name: position.name,
      staffCategory: position.staff_category,
      workZone: position.work_zone,
      activities: position.activities,
      currentEmployeeCount: position.employees.length,
      trainingIntervalMonths: position.training_interval_months,
      needsProtectiveEquipment: position.needs_protective_equipment,
      needsInstructions: position.needs_instructions,
      instructions: position.job_position_instructions.flatMap((applied) => {
        const version = applied.instruction_modules.instruction_module_versions[0];
        // A module row is written before its first version; one caught in between annexes nothing.
        if (!version) return [];
        return [
          {
            moduleId: applied.module_id,
            title: applied.instruction_modules.title,
            group: applied.instruction_modules.module_group,
            version: { id: version.id, number: version.number, createdAt: version.created_at },
          },
        ];
      }),
      equipment: position.job_position_equipment.map((entry) => ({
        risk: entry.risk,
        item: entry.item,
        quantity: entry.quantity,
        durationMonths: entry.duration_months,
        allocation: entry.allocation as EquipmentAllocation,
      })),
    })),
    staffCategoriesInUse: categories.filter((_, index) => (employeeCounts[index]?.count ?? 0) > 0),
    currentEmployeeCount: headcount.count ?? 0,
    workersRepresentativeDecisionGenerated: (generatedDecision.count ?? 0) > 0,
    ownInstructions,
    riskEvaluations,
  };
}

const bySortOrder = (
  a: { sort_order: number; id: string },
  b: { sort_order: number; id: string }
) => a.sort_order - b.sort_order || a.id.localeCompare(b.id);

/** Every evaluation of the client with its factors and measures, each in the evaluator's order. */
export async function loadRiskEvaluations(
  db: DataClient,
  clientId: string
): Promise<RiskEvaluationFacts[]> {
  const { data, error } = await db
    .from('risk_evaluations')
    .select(
      'id, kind, job_position_id, name, means_of_production, work_environment, exposure, work_task, exposed_persons, risk_factors(id, component, factor_group, description, gravity_class, probability_class, actions, deadline, responsible_person, observations, sort_order, prevention_measures(id, kind, description, sort_order))'
    )
    .eq('client_id', clientId);
  if (error) throw fromDatabaseError(error, 'document facts: risk evaluations');
  return data.map((evaluation) => ({
    id: evaluation.id,
    kind: evaluation.kind,
    jobPositionId: evaluation.job_position_id,
    name: evaluation.name,
    meansOfProduction: evaluation.means_of_production,
    workEnvironment: evaluation.work_environment,
    exposure: evaluation.exposure,
    workTask: evaluation.work_task,
    exposedPersons: evaluation.exposed_persons,
    factors: [...evaluation.risk_factors].sort(bySortOrder).map((factor) => ({
      component: factor.component,
      group: factor.factor_group,
      description: factor.description,
      gravityClass: factor.gravity_class,
      probabilityClass: factor.probability_class,
      measures: [...factor.prevention_measures].sort(bySortOrder).map((measure) => ({
        kind: measure.kind,
        description: measure.description,
      })),
      actions: factor.actions,
      deadline: factor.deadline,
      responsiblePerson: factor.responsible_person,
      observations: factor.observations,
    })),
  }));
}

/**
 * The client's newest own instructions revision, draft or issued, with the modules it annexes
 * at the versions it annexed them (ADR 014). Null while there is none, or when the newest is
 * an uploaded file, which annexes nothing the themes could cite.
 */
export async function loadOwnInstructions(
  db: DataClient,
  clientId: string
): Promise<DocumentFacts['ownInstructions']> {
  const revision = await db
    .from('document_revisions')
    .select('id, revision, data_snapshot, client_documents!inner(client_id, type_key)')
    .eq('client_documents.client_id', clientId)
    .eq('client_documents.type_key', 'own_instructions')
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (revision.error) throw fromDatabaseError(revision.error, 'document facts: own instructions');
  const annexes = revision.data ? snapshotAnnexes(revision.data.data_snapshot) : null;
  if (!revision.data || !annexes) return null;
  if (annexes.length === 0) {
    return { revisionId: revision.data.id, revisionNumber: revision.data.revision, annexes: [] };
  }
  const versionIds = annexes.map((annex) => annex.versionId);
  const versions = await db
    .from('instruction_module_versions')
    .select('id, module_id, article_count')
    .in('id', versionIds);
  if (versions.error) {
    throw fromDatabaseError(versions.error, 'document facts: annexed module versions');
  }
  const byId = new Map(versions.data.map((version) => [version.id, version]));
  return {
    revisionId: revision.data.id,
    revisionNumber: revision.data.revision,
    annexes: annexes.flatMap((annex) => {
      const version = byId.get(annex.versionId);
      // Out of reach only for a snapshot naming another organization's module.
      if (!version) return [];
      return [
        {
          moduleId: version.module_id,
          versionId: version.id,
          title: annex.title,
          articleCount: version.article_count,
        },
      ];
    }),
  };
}
