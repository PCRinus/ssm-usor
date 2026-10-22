import { z } from 'zod';

// Apart from signatures.ts, which imports the tests' contracts: the tests' payloads use these too.

/**
 * A slot of a record as the member sees it: `unassigned` has neither a request nor a signature,
 * `paper` is marked as signed by hand, `void` had a request or a signature that was voided and
 * nothing live since.
 */
export const signatureSlotStates = ['unassigned', 'pending', 'signed', 'paper', 'void'] as const;
export const signatureSlotStateSchema = z.enum(signatureSlotStates);
export type SignatureSlotState = z.infer<typeof signatureSlotStateSchema>;
