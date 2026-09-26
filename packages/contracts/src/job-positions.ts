import { z } from 'zod';

// The posts a client employs people in, as occupational safety sees them (ADR 006).

/** The two kinds of staff the training decision gives an interval each. */
export const staffCategories = ['technical_administrative', 'execution'] as const;

export const staffCategorySchema = z.enum(staffCategories);

export type StaffCategory = z.infer<typeof staffCategorySchema>;

const optionalText = (min: number, max: number) => z.string().trim().min(min).max(max).nullish();

/** The longest interval H.G. 1425/2006 art. 96 allows each category, which the database checks too. */
export const maxTrainingIntervalMonths: Record<StaffCategory, number> = {
  execution: 6,
  technical_administrative: 12,
};

// Null follows the interval the client sets for the post's category.
const trainingIntervalMonths = z.int().min(1).max(12);

export const jobPositionRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    // Left out, the category with the shorter interval, so a mistake errs towards training
    // too often.
    staffCategory: staffCategorySchema.default('execution'),
    // The kind of place the work happens in ("Birou", "Atelier, teren"). Not a workplace.
    workZone: optionalText(1, 120),
    // What the person in it actually does.
    activities: optionalText(1, 2000),
    trainingIntervalMonths: trainingIntervalMonths.nullish(),
  })
  .refine(
    (body) =>
      body.trainingIntervalMonths == null ||
      body.trainingIntervalMonths <= maxTrainingIntervalMonths[body.staffCategory],
    { path: ['trainingIntervalMonths'], message: 'Too long an interval for this staff category.' }
  );

export type JobPositionRequest = z.infer<typeof jobPositionRequestSchema>;

export const jobPositionSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  name: z.string(),
  staffCategory: staffCategorySchema,
  workZone: z.string().nullable(),
  activities: z.string().nullable(),
  trainingIntervalMonths: trainingIntervalMonths.nullable(),
  // Current employees in it: those who left, and rows archived as mistakes, do not count.
  employeeCount: z.int().min(0),
  // Null until decided; false when the post needs none; true while it has entries (ADR 011).
  needsProtectiveEquipment: z.boolean().nullable(),
  equipmentCount: z.int().min(0),
  // Null until decided; false when the post needs none; true while it applies modules (ADR 012).
  needsInstructions: z.boolean().nullable(),
  instructionCount: z.int().min(0),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type JobPosition = z.infer<typeof jobPositionSchema>;

export const jobPositionListResponseSchema = z.object({ items: z.array(jobPositionSchema) });

export type JobPositionListResponse = z.infer<typeof jobPositionListResponseSchema>;

export const jobPositionResponseSchema = z.object({ jobPosition: jobPositionSchema });

export type JobPositionResponse = z.infer<typeof jobPositionResponseSchema>;

/** `reason` values on job position errors, so the SPA can word them itself. */
export const jobPositionErrorReasons = ['job_position_name_taken', 'job_position_held'] as const;

export type JobPositionErrorReason = (typeof jobPositionErrorReasons)[number];
