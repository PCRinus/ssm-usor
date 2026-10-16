import { z } from 'zod';

export const trainingDomains = ['ssm', 'psi'] as const;
export const trainingDomainSchema = z.enum(trainingDomains);
export type TrainingDomain = z.infer<typeof trainingDomainSchema>;

export const trainingDomainLabels: Record<TrainingDomain, string> = {
  ssm: 'SSM',
  psi: 'PSI',
};

export const trainingPhases = [
  'introductory_general',
  'workplace',
  'periodic',
  'supplementary',
] as const;
export const trainingPhaseSchema = z.enum(trainingPhases);
export type TrainingPhase = z.infer<typeof trainingPhaseSchema>;

export const trainingPhaseLabels: Record<TrainingPhase, string> = {
  introductory_general: 'Introductiv-generală',
  workplace: 'La locul de muncă',
  periodic: 'Periodică',
  supplementary: 'Periodică suplimentară',
};

/** The cases of H.G. 1425/2006 art. 98. */
export const supplementaryTrainingReasons = [
  'absence_over_thirty_days',
  'rules_changed',
  'after_accident',
  'special_works',
  'new_equipment',
  'changed_procedure',
  'new_technology',
] as const;
export const supplementaryTrainingReasonSchema = z.enum(supplementaryTrainingReasons);
export type SupplementaryTrainingReason = z.infer<typeof supplementaryTrainingReasonSchema>;

export const supplementaryTrainingReasonLabels: Record<SupplementaryTrainingReason, string> = {
  absence_over_thirty_days: 'Absență de peste 30 de zile lucrătoare',
  rules_changed:
    'Modificarea prevederilor de securitate și sănătate în muncă sau a instrucțiunilor proprii',
  after_accident: 'Reluarea activității după un accident de muncă',
  special_works: 'Executarea unor lucrări speciale',
  new_equipment: 'Introducerea unui echipament de muncă sau modificarea celui existent',
  changed_procedure: 'Modificarea tehnologiilor existente sau a procedurilor de lucru',
  new_technology: 'Introducerea unei noi tehnologii sau proceduri de lucru',
};

// A training typed from a sheet filled by hand, its signatures on the paper (ADR 021).
export const trainingSources = ['app', 'paper'] as const;
export const trainingSourceSchema = z.enum(trainingSources);
export type TrainingSource = z.infer<typeof trainingSourceSchema>;

export const trainingStates = ['untrained', 'current', 'due', 'overdue'] as const;
export const trainingStateSchema = z.enum(trainingStates);
export type TrainingState = z.infer<typeof trainingStateSchema>;

export const trainingStateLabels: Record<TrainingState, string> = {
  untrained: 'Neinstruit',
  current: 'La zi',
  due: 'Scadentă',
  overdue: 'Depășită',
};

/** The states a list is filtered by: the ones that need the specialist. */
export const trainingStateFilters = ['untrained', 'due', 'overdue'] as const;
export const trainingStateFilterSchema = z.enum(trainingStateFilters);
export type TrainingStateFilter = z.infer<typeof trainingStateFilterSchema>;

export const trainingIntervalSources = ['position', 'client'] as const;
export const trainingIntervalSourceSchema = z.enum(trainingIntervalSources);
export type TrainingIntervalSource = z.infer<typeof trainingIntervalSourceSchema>;

/** One domain's standing, computed from the records and never stored (ADR 021). */
export const trainingStatusSchema = z.object({
  // Null for a leaver.
  state: trainingStateSchema.nullable(),
  // Null while the interval is undecided or the category is not trained, and before a hiring
  // training is recorded.
  dueOn: z.iso.date().nullable(),
  lastPeriodicOn: z.iso.date().nullable(),
  // Null while undecided.
  intervalMonths: z.int().min(1).nullable(),
  // A position overrides the client's programme for SSM only; never for PSI (#371).
  intervalSource: trainingIntervalSourceSchema.nullable(),
});

export type TrainingStatus = z.infer<typeof trainingStatusSchema>;

export const employeeTrainingSchema = z.object({
  ssm: trainingStatusSchema,
  psi: trainingStatusSchema,
});

export type EmployeeTraining = z.infer<typeof employeeTrainingSchema>;

const personText = z.string().trim().min(1).max(160);

export const trainingPersonRequestSchema = z.object({ name: personText, jobTitle: personText });

export const trainingAdmissionRequestSchema = z.object({
  admittedOn: z.iso.date(),
  name: personText,
  jobTitle: personText,
});

/**
 * `admission`, "admis la lucru", is the same for every attendee and belongs to a workplace
 * training only.
 */
export const trainingRequestSchema = z
  .object({
    domain: trainingDomainSchema,
    phase: trainingPhaseSchema,
    heldOn: z.iso.date(),
    durationMinutes: z.int().min(1).max(600),
    material: z.string().trim().min(1).max(4000),
    trainer: trainingPersonRequestSchema,
    verifier: trainingPersonRequestSchema.nullish(),
    supplementaryReason: supplementaryTrainingReasonSchema.nullish(),
    source: trainingSourceSchema.default('app'),
    themesRevisionId: z.uuid().nullish(),
    notes: z.string().trim().min(1).max(2000).nullish(),
    // Any status: a record typed from paper may belong to someone who has left.
    employeeIds: z.array(z.uuid()).min(1).max(500),
    admission: trainingAdmissionRequestSchema.nullish(),
  })
  .superRefine((body, ctx) => {
    if (body.phase === 'supplementary' && !body.supplementaryReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['supplementaryReason'],
        message: 'A supplementary training needs its reason.',
      });
    }
    if (body.phase !== 'supplementary' && body.supplementaryReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['supplementaryReason'],
        message: 'Only a supplementary training has a reason.',
      });
    }
    if (body.phase !== 'workplace' && body.admission) {
      ctx.addIssue({
        code: 'custom',
        path: ['admission'],
        message: 'Only a workplace training admits to work.',
      });
    }
    if (new Set(body.employeeIds).size !== body.employeeIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['employeeIds'],
        message: 'Each employee attends once.',
      });
    }
  });

export type TrainingRequest = z.infer<typeof trainingRequestSchema>;

const personSchema = z.object({ name: z.string(), jobTitle: z.string() });

export const trainingSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  domain: trainingDomainSchema,
  phase: trainingPhaseSchema,
  heldOn: z.iso.date(),
  durationMinutes: z.int(),
  material: z.string(),
  trainer: personSchema,
  verifier: personSchema.nullable(),
  supplementaryReason: supplementaryTrainingReasonSchema.nullable(),
  source: trainingSourceSchema,
  themesRevisionId: z.uuid().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Training = z.infer<typeof trainingSchema>;

export const trainingAttendeeSchema = z.object({
  employeeId: z.uuid(),
  lastName: z.string(),
  firstName: z.string(),
});

export type TrainingAttendee = z.infer<typeof trainingAttendeeSchema>;

export const trainingListItemSchema = trainingSchema.extend({
  attendeeCount: z.int().min(0),
  attendees: z.array(trainingAttendeeSchema),
});

export type TrainingListItem = z.infer<typeof trainingListItemSchema>;

export const trainingAdmissionSchema = z.object({
  admittedOn: z.iso.date(),
  name: z.string(),
  jobTitle: z.string(),
});

export type TrainingAdmission = z.infer<typeof trainingAdmissionSchema>;

export const trainingRecordSchema = z.object({
  id: z.uuid(),
  employee: z.object({ id: z.uuid(), lastName: z.string(), firstName: z.string() }),
  // The position's name when the record was made.
  occupation: z.string(),
  admission: trainingAdmissionSchema.nullable(),
});

export type TrainingRecord = z.infer<typeof trainingRecordSchema>;

export const trainingDetailSchema = trainingSchema.extend({
  records: z.array(trainingRecordSchema),
});

export type TrainingDetail = z.infer<typeof trainingDetailSchema>;

export const trainingResponseSchema = z.object({ training: trainingDetailSchema });

export type TrainingResponse = z.infer<typeof trainingResponseSchema>;

export const listTrainingsQuerySchema = z.object({
  domain: trainingDomainSchema.optional(),
  phase: trainingPhaseSchema.optional(),
});

export type ListTrainingsQuery = z.infer<typeof listTrainingsQuerySchema>;

export const trainingListResponseSchema = z.object({ items: z.array(trainingListItemSchema) });

export type TrainingListResponse = z.infer<typeof trainingListResponseSchema>;

export const employeeTrainingRecordSchema = z.object({
  id: z.uuid(),
  occupation: z.string(),
  admission: trainingAdmissionSchema.nullable(),
  training: trainingSchema,
});

export type EmployeeTrainingRecord = z.infer<typeof employeeTrainingRecordSchema>;

export const listEmployeeTrainingRecordsQuerySchema = z.object({
  domain: trainingDomainSchema.optional(),
});

export type ListEmployeeTrainingRecordsQuery = z.infer<
  typeof listEmployeeTrainingRecordsQuerySchema
>;

export const employeeTrainingRecordListResponseSchema = z.object({
  items: z.array(employeeTrainingRecordSchema),
});

export type EmployeeTrainingRecordListResponse = z.infer<
  typeof employeeTrainingRecordListResponseSchema
>;

export const trainingProposalQuerySchema = z.object({
  domain: trainingDomainSchema,
  phase: trainingPhaseSchema,
  heldOn: z.iso.date(),
  // The position whose session, modules and trainer are proposed; the attendees may hold others.
  jobPositionId: z.uuid().optional(),
});

export type TrainingProposalQuery = z.infer<typeof trainingProposalQuerySchema>;

// A professional title or a role the organization has not filled in is null.
const proposedPersonSchema = z.object({ name: z.string(), jobTitle: z.string().nullable() });

export type ProposedTrainingPerson = z.infer<typeof proposedPersonSchema>;

/**
 * What the plan proposes for a training held (ADR 021), every value one the specialist may
 * change. Null where nothing can be proposed: a material without generated themes, a person the
 * app does not hold.
 */
export const trainingProposalSchema = z.object({
  durationMinutes: z.int().nullable(),
  material: z.string().nullable(),
  trainer: proposedPersonSchema.nullable(),
  verifier: proposedPersonSchema.nullable(),
  admittedBy: proposedPersonSchema.nullable(),
  // The themes revision the material was read from, which the training then records.
  themesRevisionId: z.uuid().nullable(),
});

export type TrainingProposal = z.infer<typeof trainingProposalSchema>;
