import {
  type EquipmentAllocation,
  fireSafetyDocumentTypeKeys,
  fireSafetyTypeKeysFromTenEmployees,
  type ResponsiblePersonRole,
  type StaffCategory,
} from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { DocumentFacts } from './context';
import type { RiskEvaluationFacts } from './risk-assessment';
import { snapshotAnnexes } from './snapshot';

// Row-level security scopes every query to the caller's organization. With the secret key
// nothing does but the ids: the client's must already be known to be the preparer's.

export type StoredDocumentFacts = Omit<
  DocumentFacts,
  'issueDate' | 'firstDecisionNumber' | 'period'
> & {
  clientArchived: boolean;
};

const moduleVersionsPath =
  'job_position_instructions.instruction_modules.instruction_module_versions';

/**
 * The member who prepares the documents, whoever generates them unless told otherwise, and
 * their organization, named because the secret key the queue consumer reads with has none.
 */
export type Preparer = { userId: string; organizationId: string };

export async function loadDocumentFacts(
  db: DataClient,
  clientId: string,
  preparer: Preparer
): Promise<StoredDocumentFacts> {
  const categories: StaffCategory[] = ['technical_administrative', 'execution'];
  const [
    client,
    organization,
    membership,
    profile,
    persons,
    headcount,
    conditionalDocuments,
    positions,
    ownInstructions,
    fireOwnInstructions,
    workplaces,
    riskEvaluations,
    fireSafety,
    fireEquipment,
    fireInstallations,
    fireSubstances,
    fireMaintenanceItems,
    fireBuildings,
    participants,
    openInvitations,
    ...employeeCounts
  ] = await Promise.all([
    db
      .from('clients')
      .select(
        'legal_name, legal_representative_name, legal_representative_role, periodic_training_minutes, administrative_training_interval_months, administrative_training_not_applicable, worker_training_interval_months, worker_training_not_applicable, training_first_month, training_day_from, training_day_to, caen_code, cui, trade_register_number, county_code, locality, address_line, contact_name, contact_phone, contact_email, archived_at'
      )
      .eq('id', clientId)
      .maybeSingle(),
    db
      .from('organizations')
      .select(
        'legal_name, legal_representative_name, legal_representative_role, fire_safety_technician_name, fire_safety_technician_certificate, fire_safety_authorization, phone'
      )
      .eq('id', preparer.organizationId)
      .single(),
    db
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', preparer.organizationId)
      .eq('user_id', preparer.userId)
      .maybeSingle(),
    db
      .from('profiles')
      .select('full_name, professional_title')
      .eq('user_id', preparer.userId)
      .maybeSingle(),
    db
      .from('client_responsible_persons')
      .select('full_name, job_title, roles, workplace_id, employees(status, archived_at)')
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
    // A document row without a revision is a failed generation, not a generated document. The
    // fire-safety set's whole, which its annual report lists (ADR 020).
    db
      .from('client_documents')
      .select(
        'type_key, title, decision_number, period, document_revisions!inner(revision, status, document_generations(issue_date))'
      )
      .eq('client_id', clientId)
      .in('type_key', ['decision_workers_representative', ...fireSafetyDocumentTypeKeys]),
    // In the order of the positions table, with the entries in the order they were added.
    db
      .from('job_positions')
      .select(
        'id, name, staff_category, work_zone, activities, training_interval_months, needs_protective_equipment, needs_instructions, needs_fire_instructions, employees(id), job_position_equipment(risk, item, quantity, duration_months, allocation, created_at, id), job_position_instructions(module_id, domain, instruction_modules(title, module_group, instruction_module_versions(id, number, created_at)))'
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
    loadOwnInstructions(db, clientId, 'fire_own_instructions'),
    db
      .from('client_workplaces')
      .select(
        'id, name, is_registered_office, county_code, locality, address_line, activity, kind, floor_area_m2, extinguisher_norm, assembly_point, combustible_materials, ignition_sources, fire_risk_equipment, specific_measures'
      )
      .eq('client_id', clientId)
      .is('archived_at', null)
      .order('name')
      .order('id'),
    loadRiskEvaluations(db, clientId),
    db
      .from('client_fire_safety')
      .select(
        'periodic_training_hours, administrative_training_interval_months, worker_training_interval_months, training_first_month, training_day_from, training_day_to, smoking_policy, smoking_place, waste_kinds, waste_contractor, waste_collectors, has_third_parties, substances_state'
      )
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('fire_equipment')
      .select('workplace_id, kind, agent, capacity, wheeled, next_service_on, maintainer')
      .eq('client_id', clientId)
      .order('created_at')
      .order('id'),
    db
      .from('fire_installations')
      .select('workplace_id, kind, description, maintainer, last_check_on, next_check_on')
      .eq('client_id', clientId)
      .order('created_at')
      .order('id'),
    db
      .from('fire_substances')
      .select(
        'name, classification, quantity, physical_chemical_properties, identification_codes, health_environment_risks, protection_means, intervention_measures, extinguishing_agents, storage_place, handling'
      )
      .eq('client_id', clientId)
      .order('sort_order')
      .order('created_at')
      .order('id'),
    db
      .from('fire_maintenance_items')
      .select('workplace_id, subject, interval_label, checked_by')
      .eq('client_id', clientId)
      .order('sort_order')
      .order('created_at')
      .order('id'),
    db
      .from('fire_buildings')
      .select(
        'workplace_id, year_built, built_area_m2, levels, classification, structure, heating_fuel, gas_use, electrical_maintainer, electrical_last_check_on, water_reserve_m3, notes'
      )
      .eq('client_id', clientId),
    db
      .from('client_participants')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('revoked_at', null),
    db
      .from('participant_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
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
  if (membership.error) throw fromDatabaseError(membership.error, 'document facts: membership');
  if (profile.error) throw fromDatabaseError(profile.error, 'document facts: profile');
  if (persons.error) throw fromDatabaseError(persons.error, 'document facts: responsible persons');
  if (headcount.error) throw fromDatabaseError(headcount.error, 'document facts: employee count');
  if (conditionalDocuments.error) {
    throw fromDatabaseError(conditionalDocuments.error, 'document facts: conditional documents');
  }
  const generated = new Set(conditionalDocuments.data.map((document) => document.type_key));
  if (positions.error) throw fromDatabaseError(positions.error, 'document facts: job positions');
  if (workplaces.error) throw fromDatabaseError(workplaces.error, 'document facts: workplaces');
  if (fireSafety.error) throw fromDatabaseError(fireSafety.error, 'document facts: fire safety');
  if (fireEquipment.error) {
    throw fromDatabaseError(fireEquipment.error, 'document facts: fire equipment');
  }
  if (fireInstallations.error) {
    throw fromDatabaseError(fireInstallations.error, 'document facts: fire installations');
  }
  if (fireSubstances.error) {
    throw fromDatabaseError(fireSubstances.error, 'document facts: fire substances');
  }
  if (fireMaintenanceItems.error) {
    throw fromDatabaseError(fireMaintenanceItems.error, 'document facts: fire maintenance items');
  }
  if (fireBuildings.error) {
    throw fromDatabaseError(fireBuildings.error, 'document facts: fire buildings');
  }
  if (participants.error)
    throw fromDatabaseError(participants.error, 'document facts: participants');
  if (openInvitations.error) {
    throw fromDatabaseError(openInvitations.error, 'document facts: participant invitations');
  }
  for (const count of employeeCounts) {
    if (count.error) throw fromDatabaseError(count.error, 'document facts: employee categories');
  }

  return {
    // Every plan carries the line for now; the switch arrives with billing (docs/document-branding.md).
    branding: true,
    clientArchived: client.data.archived_at !== null,
    organization: {
      legalName: organization.data.legal_name,
      representativeName: organization.data.legal_representative_name,
      representativeRole: organization.data.legal_representative_role,
      fireSafetyTechnicianName: organization.data.fire_safety_technician_name,
      fireSafetyTechnicianCertificate: organization.data.fire_safety_technician_certificate,
      fireSafetyAuthorization: organization.data.fire_safety_authorization,
      phone: organization.data.phone,
    },
    specialist: membership.data
      ? {
          fullName: profile.data?.full_name ?? null,
          professionalTitle: profile.data?.professional_title ?? null,
        }
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
      cui: client.data.cui,
      tradeRegisterNumber: client.data.trade_register_number,
      countyCode: client.data.county_code,
      locality: client.data.locality,
      addressLine: client.data.address_line,
      contactName: client.data.contact_name,
      contactPhone: client.data.contact_phone,
      contactEmail: client.data.contact_email,
    },
    workplaces: workplaces.data.map((workplace) => ({
      id: workplace.id,
      name: workplace.name,
      registeredOffice: workplace.is_registered_office,
      countyCode: workplace.county_code,
      locality: workplace.locality,
      addressLine: workplace.address_line,
      activity: workplace.activity,
      kind: workplace.kind,
      floorAreaM2: workplace.floor_area_m2,
      extinguisherNorm: workplace.extinguisher_norm,
      assemblyPoint: workplace.assembly_point,
      combustibleMaterials: workplace.combustible_materials,
      ignitionSources: workplace.ignition_sources,
      fireRiskEquipment: workplace.fire_risk_equipment,
      specificMeasures: workplace.specific_measures,
    })),
    fireSafety: {
      card: fireSafety.data && {
        periodicTrainingHours: fireSafety.data.periodic_training_hours,
        administrativeTrainingIntervalMonths:
          fireSafety.data.administrative_training_interval_months,
        workerTrainingIntervalMonths: fireSafety.data.worker_training_interval_months,
        trainingFirstMonth: fireSafety.data.training_first_month,
        trainingDayFrom: fireSafety.data.training_day_from,
        trainingDayTo: fireSafety.data.training_day_to,
        smokingPolicy: fireSafety.data.smoking_policy,
        smokingPlace: fireSafety.data.smoking_place,
        wasteKinds: fireSafety.data.waste_kinds,
        wasteContractor: fireSafety.data.waste_contractor,
        wasteCollectors: fireSafety.data.waste_collectors,
        hasThirdParties: fireSafety.data.has_third_parties,
      },
      equipment: fireEquipment.data.map((unit) => ({
        workplaceId: unit.workplace_id,
        kind: unit.kind,
        agent: unit.agent,
        capacity: unit.capacity,
        wheeled: unit.wheeled,
        nextServiceOn: unit.next_service_on,
        maintainer: unit.maintainer,
      })),
      installations: fireInstallations.data.map((installation) => ({
        workplaceId: installation.workplace_id,
        kind: installation.kind,
        description: installation.description,
        maintainer: installation.maintainer,
        lastCheckOn: installation.last_check_on,
        nextCheckOn: installation.next_check_on,
      })),
      maintenanceItems: fireMaintenanceItems.data.map((item) => ({
        workplaceId: item.workplace_id,
        subject: item.subject,
        intervalLabel: item.interval_label,
        checkedBy: item.checked_by,
      })),
      buildings: fireBuildings.data.map((building) => ({
        workplaceId: building.workplace_id,
        yearBuilt: building.year_built,
        builtAreaM2: building.built_area_m2,
        levels: building.levels,
        classification: building.classification,
        structure: building.structure,
        heatingFuel: building.heating_fuel,
        gasUse: building.gas_use,
        electricalMaintainer: building.electrical_maintainer,
        electricalLastCheckOn: building.electrical_last_check_on,
        waterReserveM3: building.water_reserve_m3,
        notes: building.notes,
      })),
      generatedFromTenEmployees: fireSafetyTypeKeysFromTenEmployees.filter((typeKey) =>
        generated.has(typeKey)
      ),
      documents: conditionalDocuments.data
        .filter((document) => document.type_key.startsWith('fire_'))
        .map((document) => {
          const current = (status: 'draft' | 'issued') => {
            const revision = document.document_revisions.find((each) => each.status === status);
            return revision
              ? {
                  revision: revision.revision,
                  issueDate: revision.document_generations?.issue_date ?? null,
                }
              : null;
          };
          return {
            typeKey: document.type_key,
            title: document.title,
            decisionNumber: document.decision_number,
            period: document.period,
            draft: current('draft'),
            issued: current('issued'),
          };
        }),
      substances: {
        state: fireSafety.data?.substances_state ?? 'undecided',
        entries: fireSubstances.data.map((substance) => ({
          name: substance.name,
          classification: substance.classification,
          quantity: substance.quantity,
          physicalChemicalProperties: substance.physical_chemical_properties,
          identificationCodes: substance.identification_codes,
          healthEnvironmentRisks: substance.health_environment_risks,
          protectionMeans: substance.protection_means,
          interventionMeasures: substance.intervention_measures,
          extinguishingAgents: substance.extinguishing_agents,
          storagePlace: substance.storage_place,
          handling: substance.handling,
        })),
      },
    },
    responsiblePersons: persons.data.map((person) => ({
      fullName: person.full_name,
      jobTitle: person.job_title,
      roles: person.roles as ResponsiblePersonRole[],
      workplaceId: person.workplace_id,
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
      needsFireInstructions: position.needs_fire_instructions,
      instructions: position.job_position_instructions.flatMap((applied) => {
        const version = applied.instruction_modules.instruction_module_versions[0];
        // A module row is written before its first version; one caught in between annexes nothing.
        if (!version) return [];
        return [
          {
            moduleId: applied.module_id,
            domain: applied.domain,
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
    hasParticipants: (participants.count ?? 0) + (openInvitations.count ?? 0) > 0,
    workersRepresentativeDecisionGenerated: generated.has('decision_workers_representative'),
    ownInstructions,
    fireOwnInstructions,
    riskEvaluations,
  };
}

const bySortOrder = (
  a: { sort_order: number; id: string },
  b: { sort_order: number; id: string }
) => a.sort_order - b.sort_order || a.id.localeCompare(b.id);

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
 * The client's newest own instructions revision of either set, draft or issued, with the modules
 * it annexes at the versions it annexed them (ADR 014). Null while there is none, or when the
 * newest is an uploaded file, which annexes nothing the themes could cite.
 */
export async function loadOwnInstructions(
  db: DataClient,
  clientId: string,
  typeKey: 'own_instructions' | 'fire_own_instructions' = 'own_instructions'
): Promise<DocumentFacts['ownInstructions']> {
  const revision = await db
    .from('document_revisions')
    .select('id, revision, data_snapshot, client_documents!inner(client_id, type_key)')
    .eq('client_documents.client_id', clientId)
    .eq('client_documents.type_key', typeKey)
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
