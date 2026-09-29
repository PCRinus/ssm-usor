import { clientConflictReasons } from '@ssm-usor/contracts';
import type { UseFormReturn } from 'react-hook-form';

import type { ApiErrorResponse } from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { type ClientFormValues, type ClientStage, emptyClientForm } from './client-form-schema';

export const clientWording = {
  client: {
    saved: 'Datele clientului au fost salvate.',
    added: (name: string) => `${name} a fost adăugat.`,
    archived: 'Clientul este arhivat; datele lui nu mai pot fi modificate.',
    gone: 'Clientul nu mai există în organizația ta.',
    forbidden: 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.',
    failed: 'Nu am putut salva clientul. Verifică conexiunea și încearcă din nou.',
  },
  lead: {
    saved: 'Datele clientului potențial au fost salvate.',
    added: (name: string) => `${name} a fost adăugat printre clienții potențiali.`,
    archived: 'Clientul potențial este arhivat; datele lui nu mai pot fi modificate.',
    gone: 'Clientul potențial nu mai există în organizația ta.',
    forbidden: 'Doar un administrator al organizației lucrează cu clienții potențiali.',
    failed: 'Nu am putut salva clientul potențial. Verifică conexiunea și încearcă din nou.',
  },
} as const;

const formFields = new Set<keyof ClientFormValues>(Object.keys(emptyClientForm) as never[]);

// `shown` holds the fields on screen: an issue about any other one goes above the buttons,
// where the person can see it.
export function reportClientSaveError(
  form: UseFormReturn<ClientFormValues>,
  cause: unknown,
  stage: ClientStage,
  shown: ReadonlySet<keyof ClientFormValues> = formFields
) {
  const words = clientWording[stage];
  const isShown = (path: string): path is keyof ClientFormValues =>
    shown.has(path as keyof ClientFormValues);
  if (cause instanceof ApiHttpError) {
    const body = cause.body as Partial<ApiErrorResponse> | undefined;
    if (cause.status === 409) {
      if (body?.reason === clientConflictReasons.clientArchived) {
        form.setError('root.server', { message: words.archived });
        return;
      }
      const message =
        body?.reason === clientConflictReasons.cuiTakenByArchived
          ? 'Un client arhivat are deja acest CUI. Îl găsești în lista „Arhivați”, de unde un administrator îl poate restaura.'
          : body?.reason === clientConflictReasons.cuiTakenByLead
            ? 'Firma cu acest CUI este deja printre clienții potențiali ai organizației. Un administrator o poate transforma în client.'
            : 'Există deja un client cu acest CUI în organizația ta.';
      form.setError(isShown('cui') ? 'cui' : 'root.server', { message });
      return;
    }
    if (cause.status === 404) {
      form.setError('root.server', { message: words.gone });
      return;
    }
    if (cause.status === 400 && body?.issues?.length) {
      let mapped = false;
      for (const issue of body.issues) {
        if (isShown(issue.path)) {
          form.setError(issue.path, { message: issue.message });
          mapped = true;
        }
      }
      if (mapped) return;
    }
    if (cause.status === 401) {
      form.setError('root.server', {
        message: 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.',
      });
      return;
    }
    if (cause.status === 403) {
      form.setError('root.server', { message: words.forbidden });
      return;
    }
  }
  form.setError('root.server', { message: words.failed });
}
