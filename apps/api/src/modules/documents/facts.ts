import type { ResponsiblePersonRole } from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { DocumentFacts } from './context';

// Reads what the documents print about a provider and one of its clients. Row-level security
// scopes every query to the caller's organization.

export type StoredDocumentFacts = Omit<DocumentFacts, 'issueDate' | 'firstDecisionNumber'> & {
  clientArchived: boolean;
};

export async function loadDocumentFacts(
  db: DataClient,
  clientId: string,
  // The member who prepares the documents: whoever generates them, unless told otherwise.
  specialistUserId: string
): Promise<StoredDocumentFacts> {
  const [client, organization, members, persons] = await Promise.all([
    db
      .from('clients')
      .select(
        'legal_name, legal_representative_name, legal_representative_role, periodic_training_hours, administrative_training_interval_months, worker_training_interval_months, training_first_month, training_day_from, training_day_to, archived_at'
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
      .select('full_name, job_title, roles')
      .eq('client_id', clientId)
      .is('archived_at', null)
      // The order people were designated in is the order the decisions list them in.
      .order('created_at')
      .order('id'),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'document facts: client');
  if (!client.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }
  if (organization.error)
    throw fromDatabaseError(organization.error, 'document facts: organization');
  if (members.error) throw fromDatabaseError(members.error, 'document facts: members');
  if (persons.error) throw fromDatabaseError(persons.error, 'document facts: responsible persons');

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
      periodicTrainingHours: client.data.periodic_training_hours,
      administrativeTrainingIntervalMonths: client.data.administrative_training_interval_months,
      workerTrainingIntervalMonths: client.data.worker_training_interval_months,
      trainingFirstMonth: client.data.training_first_month,
      trainingDayFrom: client.data.training_day_from,
      trainingDayTo: client.data.training_day_to,
    },
    responsiblePersons: persons.data.map((person) => ({
      fullName: person.full_name,
      jobTitle: person.job_title,
      roles: person.roles as ResponsiblePersonRole[],
    })),
  };
}
