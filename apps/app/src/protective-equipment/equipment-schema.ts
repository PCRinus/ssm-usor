import { type EquipmentAllocation, equipmentAllocations } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { EquipmentEntryRequest, EquipmentListResponse } from '../api/generated/api';
import type { JobPosition } from '../job-positions/job-position-schema';

export type EquipmentEntry = EquipmentListResponse['items'][number];

export const allocationLabels: Record<EquipmentAllocation, string> = {
  personal_inventory: 'Inventar personal',
  section_inventory: 'Inventar de secție',
  consumable: 'Consum',
};

export const allocationHints: Record<EquipmentAllocation, string> = {
  personal_inventory: 'Se predă omului și se înlocuiește la expirarea duratei.',
  section_inventory: 'Rămâne la locul de muncă și se folosește în comun.',
  consumable: 'Se consumă și se completează; nu are durată de folosire.',
};

/** "un articol", "3 articole", "20 de articole". */
export function entryCountLabel(count: number) {
  if (count === 0) return 'Niciun articol';
  if (count === 1) return 'Un articol';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de articole` : `${count} articole`;
}

export function equipmentStateLabel(
  position: Pick<JobPosition, 'needsProtectiveEquipment' | 'equipmentCount'>
) {
  if (position.needsProtectiveEquipment === null) return 'Nedecis';
  if (position.needsProtectiveEquipment === false) return 'Nu necesită';
  return entryCountLabel(position.equipmentCount).toLowerCase().replace(/^un /, '1 ');
}

/** "2 buc. / 12 luni", "1 buc. / consum": the quantity with what limits it. */
export function quantityLabel(entry: Pick<EquipmentEntry, 'quantity' | 'durationMonths'>) {
  const duration =
    entry.durationMonths === null
      ? 'consum'
      : entry.durationMonths === 1
        ? '1 lună'
        : `${entry.durationMonths} luni`;
  return `${entry.quantity} buc. / ${duration}`;
}

const wholeNumber = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max, {
      message,
    });

// Form values are strings so inputs stay controlled; the API request is derived on submit.
export const equipmentFormSchema = z
  .object({
    risk: z
      .string()
      .trim()
      .min(1, 'Spune de ce risc protejează articolul.')
      .max(240, 'Riscul are cel mult 240 de caractere.'),
    item: z
      .string()
      .trim()
      .min(1, 'Introdu articolul de echipament.')
      .max(240, 'Articolul are cel mult 240 de caractere.'),
    quantity: wholeNumber(1, 999, 'Cantitatea este un număr întreg de la 1 la 999.'),
    allocation: z.enum(equipmentAllocations),
    durationMonths: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.allocation === 'consumable') return;
    if (!/^\d+$/.test(values.durationMonths)) {
      context.addIssue({
        code: 'custom',
        path: ['durationMonths'],
        message: 'Spune la câte luni se înlocuiește articolul.',
      });
      return;
    }
    const months = Number(values.durationMonths);
    if (months < 1 || months > 120) {
      context.addIssue({
        code: 'custom',
        path: ['durationMonths'],
        message: 'Durata este un număr de luni de la 1 la 120.',
      });
    }
  });

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

export const emptyEquipmentForm: EquipmentFormValues = {
  risk: '',
  item: '',
  quantity: '1',
  allocation: 'personal_inventory',
  durationMonths: '',
};

export function toEquipmentForm(entry: EquipmentEntry): EquipmentFormValues {
  return {
    risk: entry.risk,
    item: entry.item,
    quantity: String(entry.quantity),
    allocation: entry.allocation,
    durationMonths: entry.durationMonths?.toString() ?? '',
  };
}

export function toEquipmentRequest(values: EquipmentFormValues): EquipmentEntryRequest {
  return {
    risk: values.risk,
    item: values.item,
    quantity: Number(values.quantity),
    allocation: values.allocation,
    durationMonths: values.allocation === 'consumable' ? null : Number(values.durationMonths),
  };
}
