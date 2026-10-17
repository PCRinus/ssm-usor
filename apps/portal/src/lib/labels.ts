import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type {
  MissingSheetData,
  ResponsiblePersonRole,
  SupplementaryTrainingReason,
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
