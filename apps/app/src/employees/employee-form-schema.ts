import {
  type BloodGroup,
  bloodGroups,
  decodeCnp,
  isValidCnpInput,
  normalizeCnp,
  type RhFactor,
  rhFactors,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { CreateEmployeeRequest } from '../api/generated/api';

// Form values are strings so inputs stay controlled; the API request is derived on submit.
const optionalText = (max: number, message: string) => z.string().trim().max(max, message);
const isoDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export const employeeFormSchema = z
  .object({
    lastName: z
      .string()
      .trim()
      .min(1, 'Introdu numele de familie.')
      .max(100, 'Numele poate avea cel mult 100 de caractere.'),
    firstName: z
      .string()
      .trim()
      .min(1, 'Introdu prenumele.')
      .max(100, 'Prenumele poate avea cel mult 100 de caractere.'),
    cnp: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || isValidCnpInput(value),
        'CNP invalid. Verifică cele 13 cifre, data nașterii și cifra de control.'
      ),
    employeeNumber: optionalText(40, 'Marca poate avea cel mult 40 de caractere.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, 'Adresa de email este prea lungă.')
      .refine(
        (value) => value === '' || z.email().safeParse(value).success,
        'Introdu o adresă de email validă.'
      ),
    phone: z
      .string()
      .trim()
      .regex(/^(\+?[0-9][0-9 ().-]{3,18})?$/, 'Introdu un număr de telefon valid.'),
    // The id of one of the client's job positions, or the name of one to create (ADR 006).
    jobPosition: z
      .string()
      .trim()
      .min(2, 'Alege postul de lucru sau scrie unul nou.')
      .max(160, 'Denumirea postului poate avea cel mult 160 de caractere.'),
    jobTitle: z
      .string()
      .trim()
      .min(2, 'Introdu funcția din contract (cel puțin 2 caractere).')
      .max(160, 'Funcția poate avea cel mult 160 de caractere.'),
    hiredAt: z.string().regex(isoDate, 'Alege data angajării.'),
    birthDate: z.string().regex(/^([0-9]{4}-[0-9]{2}-[0-9]{2})?$/, 'Alege o dată validă.'),
    birthPlace: optionalText(160, 'Locul nașterii poate avea cel mult 160 de caractere.'),
    homeAddress: optionalText(240, 'Domiciliul poate avea cel mult 240 de caractere.'),
    bloodGroup: z
      .string()
      .refine(
        (value) => value === '' || (bloodGroups as readonly string[]).includes(value),
        'Alege o grupă sanguină din listă.'
      ),
    rhFactor: z
      .string()
      .refine(
        (value) => value === '' || (rhFactors as readonly string[]).includes(value),
        'Alege factorul Rh din listă.'
      ),
    notes: optionalText(2000, 'Observațiile pot avea cel mult 2000 de caractere.'),
  })
  .superRefine((values, ctx) => {
    if (values.birthDate && values.hiredAt && values.birthDate >= values.hiredAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'Data nașterii trebuie să fie înaintea datei angajării.',
      });
    }
    // Same rule as the API: the CNP encodes the birth date for Romanian citizens.
    const encoded = birthDateFromCnp(values.cnp);
    if (encoded && values.birthDate && values.birthDate !== encoded) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'Data nașterii nu corespunde cu CNP-ul.',
      });
    }
  });

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const emptyEmployeeForm: EmployeeFormValues = {
  lastName: '',
  firstName: '',
  cnp: '',
  employeeNumber: '',
  email: '',
  phone: '',
  jobPosition: '',
  jobTitle: '',
  hiredAt: '',
  birthDate: '',
  birthPlace: '',
  homeAddress: '',
  bloodGroup: '',
  rhFactor: '',
  notes: '',
};

// The birth date encoded in a valid CNP, or null when absent, invalid, or not encoded.
export function birthDateFromCnp(input: string) {
  if (!isValidCnpInput(input)) return null;
  return decodeCnp(normalizeCnp(input)!).birthDate;
}

const textOrNull = (value: string) => (value ? value : null);

export function toCreateEmployeeRequest(
  values: EmployeeFormValues,
  jobPositionId: string
): CreateEmployeeRequest {
  return {
    jobPositionId,
    lastName: values.lastName,
    firstName: values.firstName,
    cnp: values.cnp ? normalizeCnp(values.cnp) : null,
    employeeNumber: textOrNull(values.employeeNumber),
    email: textOrNull(values.email),
    phone: textOrNull(values.phone),
    jobTitle: values.jobTitle,
    hiredAt: values.hiredAt,
    birthDate: textOrNull(values.birthDate),
    birthPlace: textOrNull(values.birthPlace),
    homeAddress: textOrNull(values.homeAddress),
    bloodGroup: values.bloodGroup ? (values.bloodGroup as BloodGroup) : null,
    rhFactor: values.rhFactor ? (values.rhFactor as RhFactor) : null,
    notes: textOrNull(values.notes),
  };
}
