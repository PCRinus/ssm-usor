import type {
  DutiesAcknowledgementChangeReason,
  DutiesAcknowledgementFilter,
  DutiesAcknowledgementStatus,
  SsmDutyRole,
} from '@ssm-usor/contracts';

export const dutiesCardTitle = 'Fișa de luare la cunoștință a atribuțiilor SSM';

const rolePhrases: Record<SsmDutyRole, string> = {
  workplace_manager: 'conducătorul locului de muncă',
  first_aid: 'prim ajutor',
  imminent_danger: 'pericol grav și iminent',
  workers_representative: 'reprezentantul lucrătorilor',
};

function joined(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
}

export function sheetHolder(position: string, roles: readonly SsmDutyRole[]) {
  const phrases = roles.map((role) => rolePhrases[role]);
  if (phrases.length === 0) return `Postul ${position}, fără roluri`;
  return `Postul ${position}, cu ${phrases.length === 1 ? 'rolul' : 'rolurile'} ${joined(phrases)}`;
}

export function signAgainReason(
  reasons: readonly DutiesAcknowledgementChangeReason[],
  issueDate: string
) {
  const annex = reasons.includes('annex_changed');
  const roles = reasons.includes('roles_changed');
  if (annex && roles) {
    return `Anexa postului s-a schimbat în documentul 13 emis la ${issueDate}, iar rolurile lucrătorului s-au schimbat de la semnare.`;
  }
  if (roles) return 'Rolurile lucrătorului s-au schimbat de la semnare.';
  return `Anexa postului s-a schimbat în documentul 13 emis la ${issueDate}.`;
}

export const dutiesListLines: Partial<Record<DutiesAcknowledgementStatus, string>> = {
  to_sign: 'Atribuții SSM nesemnate',
  sign_again: 'Atribuții SSM noi, nesemnate',
  no_annex: 'Postul lipsește din doc. 13',
};

export const dutiesFilterLabels: Record<DutiesAcknowledgementFilter, string> = {
  signed: 'Semnate',
  to_sign: 'Nesemnate',
  sign_again: 'Noi, nesemnate',
  no_annex: 'Postul lipsește din doc. 13',
};
