import { z } from 'zod';

import type {
  OrganizationAuthorizationsResponse,
  UpdateOrganizationAuthorizationsRequest,
} from '@/api/generated/api';

import { optionalText, textOrNull } from './optional-text';

type Authorizations = OrganizationAuthorizationsResponse['authorizations'];

export const authorizationsFormSchema = z
  .object({
    authorizationCertificateNumber: optionalText(
      1,
      40,
      '',
      'Numărul are cel mult 40 de caractere.'
    ),
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
    fireSafetyAuthorization: optionalText(
      2,
      200,
      'Autorizația are cel puțin 2 caractere.',
      'Autorizația are cel mult 200 de caractere.'
    ),
    riskEvaluatorName: optionalText(
      2,
      160,
      'Numele are cel puțin 2 caractere.',
      'Numele are cel mult 160 de caractere.'
    ),
    riskEvaluatorTitle: optionalText(
      2,
      160,
      'Calitatea are cel puțin 2 caractere.',
      'Calitatea are cel mult 160 de caractere.'
    ),
    riskEvaluatorCertificate: optionalText(1, 80, '', 'Certificatul are cel mult 80 de caractere.'),
  })
  .superRefine(({ riskEvaluatorName, riskEvaluatorTitle }, context) => {
    // The documents print the two together; the API refuses one without the other.
    if (Boolean(riskEvaluatorName) === Boolean(riskEvaluatorTitle)) return;
    context.addIssue({
      code: 'custom',
      path: [riskEvaluatorName ? 'riskEvaluatorTitle' : 'riskEvaluatorName'],
      message: riskEvaluatorName
        ? 'Completează și calitatea evaluatorului.'
        : 'Completează și numele evaluatorului.',
    });
  });

export type AuthorizationsFormValues = z.infer<typeof authorizationsFormSchema>;

export function toAuthorizationsForm(saved: Authorizations): AuthorizationsFormValues {
  return {
    authorizationCertificateNumber: saved.authorizationCertificateNumber ?? '',
    authorizationCertificateDate: saved.authorizationCertificateDate ?? '',
    authorizationCertificateIssuer: saved.authorizationCertificateIssuer ?? '',
    fireSafetyTechnicianName: saved.fireSafetyTechnicianName ?? '',
    fireSafetyTechnicianCertificate: saved.fireSafetyTechnicianCertificate ?? '',
    fireSafetyAuthorization: saved.fireSafetyAuthorization ?? '',
    riskEvaluatorName: saved.riskEvaluatorName ?? '',
    riskEvaluatorTitle: saved.riskEvaluatorTitle ?? '',
    riskEvaluatorCertificate: saved.riskEvaluatorCertificate ?? '',
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
    fireSafetyAuthorization: textOrNull(values.fireSafetyAuthorization),
    riskEvaluatorName: textOrNull(values.riskEvaluatorName),
    riskEvaluatorTitle: textOrNull(values.riskEvaluatorTitle),
    riskEvaluatorCertificate: textOrNull(values.riskEvaluatorCertificate),
  };
}
