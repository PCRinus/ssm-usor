import { z } from 'zod';

import type {
  OrganizationAuthorizationsResponse,
  UpdateOrganizationAuthorizationsRequest,
} from '../api/generated/api';
import { optionalText, textOrNull } from './optional-text';

type Authorizations = OrganizationAuthorizationsResponse['authorizations'];

export const authorizationsFormSchema = z.object({
  authorizationCertificateNumber: optionalText(1, 40, '', 'Numărul are cel mult 40 de caractere.'),
  authorizationCertificateDate: z.string(),
  authorizationCertificateIssuer: optionalText(
    2,
    200,
    'Emitentul are cel puțin 2 caractere.',
    'Emitentul are cel mult 200 de caractere.'
  ),
  fireSafetyTechnicianName: optionalText(
    2,
    160,
    'Numele are cel puțin 2 caractere.',
    'Numele are cel mult 160 de caractere.'
  ),
  fireSafetyTechnicianCertificate: optionalText(
    1,
    80,
    '',
    'Certificatul are cel mult 80 de caractere.'
  ),
});

export type AuthorizationsFormValues = z.infer<typeof authorizationsFormSchema>;

export function toAuthorizationsForm(saved: Authorizations): AuthorizationsFormValues {
  return {
    authorizationCertificateNumber: saved.authorizationCertificateNumber ?? '',
    authorizationCertificateDate: saved.authorizationCertificateDate ?? '',
    authorizationCertificateIssuer: saved.authorizationCertificateIssuer ?? '',
    fireSafetyTechnicianName: saved.fireSafetyTechnicianName ?? '',
    fireSafetyTechnicianCertificate: saved.fireSafetyTechnicianCertificate ?? '',
  };
}

// The route replaces every field, so an emptied input clears what was saved.
export function toAuthorizationsRequest(
  values: AuthorizationsFormValues
): UpdateOrganizationAuthorizationsRequest {
  return {
    authorizationCertificateNumber: textOrNull(values.authorizationCertificateNumber),
    authorizationCertificateDate: textOrNull(values.authorizationCertificateDate),
    authorizationCertificateIssuer: textOrNull(values.authorizationCertificateIssuer),
    fireSafetyTechnicianName: textOrNull(values.fireSafetyTechnicianName),
    fireSafetyTechnicianCertificate: textOrNull(values.fireSafetyTechnicianCertificate),
  };
}
