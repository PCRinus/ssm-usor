import { z } from 'zod';

// What the holders of a job position wear or use against the risks of the post (ADR 011).

export const equipmentAllocations = [
  'personal_inventory',
  'section_inventory',
  'consumable',
] as const;

export const equipmentAllocationSchema = z.enum(equipmentAllocations);

export type EquipmentAllocation = z.infer<typeof equipmentAllocationSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);
const quantity = z.int().min(1).max(999);
const durationMonths = z.int().min(1).max(120);

export const equipmentEntryRequestSchema = z
  .object({
    risk: text(240),
    item: text(240),
    quantity: quantity.default(1),
    // Months; left out for a consumable, where it means nothing.
    durationMonths: durationMonths.nullish(),
    allocation: equipmentAllocationSchema.default('personal_inventory'),
  })
  .refine((body) => (body.allocation === 'consumable') === (body.durationMonths == null), {
    path: ['durationMonths'],
    message: 'Inventory has a duration of use; a consumable has none.',
  });

export type EquipmentEntryRequest = z.infer<typeof equipmentEntryRequestSchema>;

export const equipmentEntrySchema = z.object({
  id: z.uuid(),
  jobPositionId: z.uuid(),
  risk: z.string(),
  item: z.string(),
  quantity,
  durationMonths: durationMonths.nullable(),
  allocation: equipmentAllocationSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type EquipmentEntry = z.infer<typeof equipmentEntrySchema>;

export const equipmentEntryResponseSchema = z.object({ entry: equipmentEntrySchema });

export type EquipmentEntryResponse = z.infer<typeof equipmentEntryResponseSchema>;

export const equipmentListResponseSchema = z.object({
  items: z.array(equipmentEntrySchema),
  // Null until decided; false when the post needs none; true while it has entries.
  needsProtectiveEquipment: z.boolean().nullable(),
});

export type EquipmentListResponse = z.infer<typeof equipmentListResponseSchema>;

export const protectiveEquipmentStates = ['undecided', 'none', 'equipped'] as const;

export type ProtectiveEquipmentState = (typeof protectiveEquipmentStates)[number];

export function protectiveEquipmentState(
  needsProtectiveEquipment: boolean | null
): ProtectiveEquipmentState {
  if (needsProtectiveEquipment === null) return 'undecided';
  return needsProtectiveEquipment ? 'equipped' : 'none';
}

// Entries decide "needs equipment" by themselves, so only "needs none" and taking that back
// are said in words.
export const protectiveEquipmentDecisionSchema = z.object({
  needsProtectiveEquipment: z.boolean().nullable(),
});

export type ProtectiveEquipmentDecision = z.infer<typeof protectiveEquipmentDecisionSchema>;

export const copyEquipmentRequestSchema = z.object({ fromJobPositionId: z.uuid() });

export type CopyEquipmentRequest = z.infer<typeof copyEquipmentRequestSchema>;

export const equipmentSuggestionFields = ['risk', 'item'] as const;

export const equipmentSuggestionsQuerySchema = z.object({
  field: z.enum(equipmentSuggestionFields),
  query: z.string().trim().max(240).default(''),
});

export type EquipmentSuggestionsQuery = z.infer<typeof equipmentSuggestionsQuerySchema>;

export const equipmentSuggestionsResponseSchema = z.object({ items: z.array(z.string()) });

export type EquipmentSuggestionsResponse = z.infer<typeof equipmentSuggestionsResponseSchema>;

/** `reason` values on protective equipment errors, so the SPA can word them itself. */
export const protectiveEquipmentErrorReasons = [
  'equipment_entries_exist',
  'equipment_decided_by_entries',
] as const;

export type ProtectiveEquipmentErrorReason = (typeof protectiveEquipmentErrorReasons)[number];
