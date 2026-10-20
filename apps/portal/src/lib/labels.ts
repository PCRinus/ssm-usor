import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type {
  KnowledgeTest,
  MissingSheetData,
  ResponsiblePersonRole,
  SupplementaryTrainingReason,
  TestGrade,
  TestState,
  TrainingDomain,
  TrainingPhase,
  TrainingState,
} from '@ssm-usor/contracts';

import type { Participation } from '@/features/participation/participation-context';

// The contracts' labels are Romanian strings; the portal keeps its own messages so that each
// can be translated.
export const trainingStateMessages: Record<TrainingState, MessageDescriptor> = {
  untrained: msg`Neinstruit`,
  current: msg`La zi`,
  due: msg`Scadentă`,
  overdue: msg`Depășită`,
};

export const testStateMessages: Record<TestState, MessageDescriptor> = {
  none: msg`Fără test`,
  pending: msg`De susținut`,
  passed: msg`Promovat`,
  annual_due: msg`Anual scadent`,
};

export const testGradeMessages: Record<TestGrade, MessageDescriptor> = {
  admis: msg`Admis`,
};

// Whole titles rather than the test and the domain joined, which reads wrong in English.
const testTitleMessages = {
  'ssm.hiring': msg`Testul la angajare SSM`,
  'psi.hiring': msg`Testul la angajare PSI`,
  'psi.annual': msg`Testul anual PSI`,
};

const testAwaitingMessages = {
  'ssm.hiring': msg`Testul la angajare SSM te așteaptă`,
  'psi.hiring': msg`Testul la angajare PSI te așteaptă`,
  'psi.annual': msg`Testul anual PSI este scadent`,
};

// There is no annual occupational safety test (ADR 024); its key falls back to the hiring one.
const testKeyOf = (domain: TrainingDomain, test: KnowledgeTest) =>
  domain === 'psi' && test === 'annual' ? 'psi.annual' : (`${domain}.hiring` as const);

export const testTitleMessage = (domain: TrainingDomain, test: KnowledgeTest) =>
  testTitleMessages[testKeyOf(domain, test)];

export const testAwaitingMessage = (domain: TrainingDomain, test: KnowledgeTest) =>
  testAwaitingMessages[testKeyOf(domain, test)];

const testSheetTitleMessages = {
  'ssm.hiring': msg`Fișa de test la angajare SSM`,
  'psi.hiring': msg`Fișa de test la angajare PSI`,
  'psi.annual': msg`Fișa de test anual PSI`,
};

export const testSheetTitleMessage = (domain: TrainingDomain, test: KnowledgeTest) =>
  testSheetTitleMessages[testKeyOf(domain, test)];

export const trainingDomainMessages: Record<TrainingDomain, MessageDescriptor> = {
  ssm: msg`SSM`,
  psi: msg`PSI`,
};

export const trainingPhaseMessages: Record<TrainingPhase, MessageDescriptor> = {
  introductory_general: msg`Instruire introductiv-generală`,
  workplace: msg`Instruire la locul de muncă`,
  periodic: msg`Instruire periodică`,
  supplementary: msg`Instruire periodică suplimentară`,
};

export const supplementaryReasonMessages: Record<SupplementaryTrainingReason, MessageDescriptor> = {
  absence_over_thirty_days: msg`Absență de peste 30 de zile lucrătoare`,
  rules_changed: msg`Modificarea prevederilor de securitate și sănătate în muncă sau a instrucțiunilor proprii`,
  after_accident: msg`Reluarea activității după un accident de muncă`,
  special_works: msg`Executarea unor lucrări speciale`,
  new_equipment: msg`Introducerea unui echipament de muncă sau modificarea celui existent`,
  changed_procedure: msg`Modificarea tehnologiilor existente sau a procedurilor de lucru`,
  new_technology: msg`Introducerea unei noi tehnologii sau proceduri de lucru`,
};

export const responsiblePersonRoleMessages: Record<ResponsiblePersonRole, MessageDescriptor> = {
  workplace_manager: msg`Conducător al locului de muncă`,
  first_aid: msg`Prim ajutor`,
  risk_evaluation_team: msg`Echipa de evaluare a riscurilor`,
  imminent_danger: msg`Pericol grav și iminent`,
  workers_representative: msg`Reprezentantul lucrătorilor`,
  fire_safety_coordinator: msg`Coordonator privind apărarea împotriva incendiilor`,
  fire_intervention_leader: msg`Șef echipă de primă intervenție`,
};

export const missingSheetDataMessages: Record<MissingSheetData, MessageDescriptor> = {
  'employee.commute_route': msg`traseul de deplasare`,
  'employee.workplace': msg`punctul de lucru`,
};

export const participationKindMessages: Record<Participation['kind'], MessageDescriptor> = {
  employee: msg`Angajat`,
  client_administrator: msg`Administratorul clientului`,
};
