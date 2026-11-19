import { clientConflictReasons } from '@ssm-usor/contracts';
import type { UseFormReturn } from 'react-hook-form';

import { apiErrorBody, ApiHttpError } from '@/api/http';
import { commonFailure, noOrganizationMessage, setApiIssues } from '@/lib/api-errors';

import {
  type ClientFormValues,
  clientMessages,
  type ClientStage,
  emptyClientForm,
} from './client-form-schema';
import { isOffersNotInPlanError, offersNotInPlanMessage } from './offers-plan';

export const clientWording = {
  client: {
    added: (name: string) => `${name} a fost adăugat.`,
    archived: 'Clientul este arhivat; datele lui nu mai pot fi modificate.',
    gone: 'Clientul nu mai există în organizația ta.',
    forbidden: noOrganizationMessage,
    failed: 'Nu am putut salva clientul. Verifică conexiunea și încearcă din nou.',
  },
  lead: {
    added: (name: string) => `${name} a fost adăugată printre oferte.`,
    archived: 'Oferta este arhivată; datele ei nu mai pot fi modificate.',
    gone: 'Oferta nu mai există în organizația ta.',
    forbidden: 'Doar un admin al organizației lucrează cu ofertele.',
    failed: 'Nu am putut salva oferta. Verifică conexiunea și încearcă din nou.',
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
    const body = apiErrorBody(cause);
    if (cause.status === 409) {
      if (body?.reason === clientConflictReasons.clientArchived) {
        form.setError('root.server', { message: words.archived });
        return;
      }
      const message =
        body?.reason === clientConflictReasons.cuiTakenByArchived
          ? clientMessages.cuiTakenByArchived
          : body?.reason === clientConflictReasons.cuiTakenByLead
            ? clientMessages.cuiTakenByLead
            : clientMessages.cuiTaken;
      form.setError(isShown('cui') ? 'cui' : 'root.server', { message });
      return;
    }
    if (cause.status === 404) {
      form.setError('root.server', { message: words.gone });
      return;
    }
    if (
      cause.status === 400 &&
      setApiIssues(form.setError, body?.issues, (path) =>
        isShown(path) ? { field: path } : undefined
      )
    ) {
      return;
    }
    const common = commonFailure(cause);
    if (common) {
      form.setError('root.server', { message: common });
      return;
    }
    if (isOffersNotInPlanError(cause)) {
      form.setError('root.server', { message: offersNotInPlanMessage });
      return;
    }
    if (cause.status === 403) {
      form.setError('root.server', { message: words.forbidden });
      return;
    }
  }
  form.setError('root.server', { message: words.failed });
}
