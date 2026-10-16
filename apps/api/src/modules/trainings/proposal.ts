import type {
  ProposedTrainingPerson,
  StaffCategory,
  TrainingDomain,
  TrainingPhase,
  TrainingProposal,
} from '@ssm-usor/contracts';

import { monthNames } from '../documents/themes';

// The content lines of the hiring plans, as the 4.2 and 3.1 templates print them in chapters I
// and II: static text there, so a plan edited in a Word file is never read back (ADR 021).
// scripts/lib/training-plans.test.ts holds them to the templates.
export const hiringPlans = {
  ssm: {
    introductoryGeneral:
      'Conform MISSMIG Art. 1 – 325; Legislația de securitate și sănătate în muncă; Consecințele posibile ale necunoașterii și nerespectării legislației de securitate și sănătate în muncă; Măsuri de acordare a primului ajutor, de prevenire și stingere a incendiilor și evacuarea lucrătorilor; Riscurile de accidentare și îmbolnăvire profesională specifice unității.',
    workplaceOpening:
      'H.G. 1051/2006, H.G. 1028/2006, H.G. 1146/2006, H.G. 493/2006, H.G. 259/2022; I.P.S.S.M. Art. 1 – 290; ',
    workplaceClosing:
      'Demonstrații practice privind activitățile desfășurate, echipamentele de muncă utilizate, utilizarea echipamentului individual de protecție, a mijloacelor de alarmare, intervenție, evacuare și de prim ajutor.',
  },
  psi: {
    introductoryGeneral:
      'IPSU art. 1–104, 131–139, 150–152, 236–245, 253–257; Legea 307/2006; Legea 481/2004; OMAI 712/2005; modul de acțiune în cazul unei situații de urgență; testare.',
    workplaceOpening:
      'IPSU art. 105–130, 140–149, 153–235, 246–252; instrucțiunile afișate la locul de muncă',
    workplaceClosing:
      '; organizarea apărării împotriva incendiilor la locul de muncă; OMAI 1184/2006; OMAI 163/2007; OMAI 106/2007; OMAI 187/2010; prezentarea riscurilor de incendiu ale locului de muncă și a planului de evacuare; utilizarea stingătorului (demonstrații practice); deciziile interne PSI.',
  },
} as const;

export const hiringMinutes: Record<TrainingDomain, number> = { ssm: 240, psi: 480 };

// The floor of H.G. 1425/2006 art. 80^1.
const supplementaryMinutes = 60;

export const fireSafetyTechnicianJobTitle = 'Cadru tehnic PSI';

type Session = { month: string; content: string; duration: string };

export type ThemesRevision = { id: string; snapshot: unknown };

export type ProposalPeople = {
  specialist: ProposedTrainingPerson | null;
  /** The first workplace manager in the order they were designated. */
  workplaceManager: ProposedTrainingPerson | null;
  legalRepresentative: ProposedTrainingPerson | null;
  fireSafetyTechnician: ProposedTrainingPerson | null;
};

export type ProposalFacts = {
  domain: TrainingDomain;
  phase: TrainingPhase;
  /** ISO date. */
  heldOn: string;
  position: { name: string; staffCategory: StaffCategory } | null;
  themes: ThemesRevision | null;
  people: ProposalPeople;
  /** The schedules' periodic duration, for a periodic training the themes have no session for. */
  periodicMinutes: number | null;
};

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const sessionsOf = (value: unknown): Session[] =>
  Array.isArray(value)
    ? value.filter(
        (session): session is Session =>
          typeof record(session)?.month === 'string' &&
          typeof record(session)?.content === 'string' &&
          typeof record(session)?.duration === 'string'
      )
    : [];

const positionKey = (name: string) => name.trim().toLocaleUpperCase('ro');

function ssmThemesPosition(snapshot: unknown, positionName: string) {
  const positions = record(record(snapshot)?.themes)?.positions;
  if (!Array.isArray(positions)) return null;
  return (
    positions.map(record).find((position) => position?.name === positionKey(positionName)) ?? null
  );
}

function fireThemesCategory(snapshot: unknown, staffCategory: StaffCategory) {
  const categories = record(record(snapshot)?.fireThemes)?.categories;
  if (!Array.isArray(categories)) return null;
  return (
    categories.map(record).find((category) => category?.staffCategory === staffCategory) ?? null
  );
}

/**
 * The session of the month the training was held in, else the last one before it, a session
 * held late being the one it catches up; before the first of the year, the year's last.
 */
export function sessionHeldIn(sessions: readonly Session[], heldOn: string) {
  const heldMonth = Number(heldOn.slice(5, 7));
  const monthOf = (session: Session) =>
    monthNames.findIndex((name) => name.toLocaleUpperCase('ro') === session.month) + 1;
  const dated = sessions
    .map((session) => ({ session, month: monthOf(session) }))
    .filter(({ month }) => month > 0)
    .sort((a, b) => a.month - b.month);
  const before = dated.filter(({ month }) => month <= heldMonth);
  return (before.at(-1) ?? dated.at(-1))?.session ?? null;
}

const minutesOf = (duration: string) => {
  const minutes = /^(\d+)\s*min$/.exec(duration.trim())?.[1];
  return minutes ? Number(minutes) : null;
};

// The themes keep ranges together with no-break spaces, which a text field would carry along.
const plain = (text: string) => text.replace(/\u00a0/g, ' ');

function periodicMaterial(facts: ProposalFacts) {
  const { themes, position, domain } = facts;
  if (!themes || !position) return null;
  const sessions = sessionsOf(
    domain === 'ssm'
      ? ssmThemesPosition(themes.snapshot, position.name)?.sessions
      : fireThemesCategory(themes.snapshot, position.staffCategory)?.sessions
  );
  const session = sessionHeldIn(sessions, facts.heldOn);
  if (!session) return null;
  return { material: plain(session.content), minutes: minutesOf(session.duration) };
}

function ssmWorkplaceMaterial(facts: ProposalFacts) {
  const { themes, position } = facts;
  const modules =
    themes && position ? ssmThemesPosition(themes.snapshot, position.name)?.modules : undefined;
  const citations = Array.isArray(modules)
    ? modules.flatMap((module) => {
        const citation = record(module)?.citation;
        return typeof citation === 'string' ? [plain(citation)] : [];
      })
    : null;
  const plan = hiringPlans.ssm;
  return {
    material: `${plan.workplaceOpening}${(citations ?? []).map((citation) => `${citation}; `).join('')}${plan.workplaceClosing}`,
    fromThemes: citations !== null,
  };
}

function fireWorkplaceMaterial(facts: ProposalFacts) {
  const decision = record(
    record(record(facts.themes?.snapshot)?.fire)?.decisionNumbers
  )?.instructions;
  const plan = hiringPlans.psi;
  const reference = typeof decision === 'string' ? ` (Decizia nr. ${plain(decision)})` : '';
  return {
    material: `${plan.workplaceOpening}${reference}${plan.workplaceClosing}`,
    fromThemes: reference !== '',
  };
}

/**
 * The trainer the themes name for a post: the specialist, or in fire safety the technician,
 * trains the technical-administrative staff, a workplace manager the others, and the legal
 * representative where the client names no manager. Without a post, a workplace manager.
 */
function positionTrainer(facts: ProposalFacts) {
  const { people } = facts;
  if (facts.position?.staffCategory === 'technical_administrative') {
    return facts.domain === 'ssm' ? people.specialist : people.fireSafetyTechnician;
  }
  return people.workplaceManager ?? people.legalRepresentative;
}

/** ADR 021, "Who signs what": the fire-safety sheet has no verifier's signature. */
export function trainingProposal(facts: ProposalFacts): TrainingProposal {
  const { domain, phase, people, themes } = facts;
  const verifier = domain === 'ssm' ? people.specialist : null;
  const proposal = (
    values: Pick<TrainingProposal, 'durationMinutes' | 'material' | 'trainer'> & {
      fromThemes: boolean;
    }
  ): TrainingProposal => ({
    durationMinutes: values.durationMinutes,
    material: values.material,
    trainer: values.trainer,
    verifier,
    admittedBy: phase === 'workplace' ? positionTrainer(facts) : null,
    themesRevisionId: values.fromThemes ? (themes?.id ?? null) : null,
  });
  switch (phase) {
    case 'introductory_general':
      return proposal({
        durationMinutes: hiringMinutes[domain],
        material: hiringPlans[domain].introductoryGeneral,
        trainer: domain === 'ssm' ? people.specialist : people.fireSafetyTechnician,
        fromThemes: false,
      });
    case 'workplace': {
      const { material, fromThemes } =
        domain === 'ssm' ? ssmWorkplaceMaterial(facts) : fireWorkplaceMaterial(facts);
      return proposal({
        durationMinutes: hiringMinutes[domain],
        material,
        trainer: positionTrainer(facts),
        fromThemes,
      });
    }
    case 'periodic': {
      const session = periodicMaterial(facts);
      return proposal({
        durationMinutes: session?.minutes ?? facts.periodicMinutes,
        material: session?.material ?? null,
        trainer: positionTrainer(facts),
        fromThemes: session !== null,
      });
    }
    case 'supplementary':
      return proposal({
        durationMinutes: supplementaryMinutes,
        material: null,
        trainer: positionTrainer(facts),
        fromThemes: false,
      });
  }
}
