import type { ApiErrorResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

// `what` is the thing being saved, articulated: "echipamentul", "instalația".
export function saveFailure(
  cause: unknown,
  what: string
): { field?: 'workplaceId'; message: string } {
  const status = cause instanceof ApiHttpError ? cause.status : null;
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (status === 400 && body?.issues?.some((issue) => issue.path === 'workplaceId')) {
    return {
      field: 'workplaceId',
      message: 'Locul de muncă a fost arhivat între timp. Alege altul.',
    };
  }
  if (status === 409) {
    return {
      message:
        body?.reason === 'client_is_lead'
          ? 'Un client potențial nu are încă mijloace PSI.'
          : 'Clientul este arhivat; datele lui nu se mai schimbă.',
    };
  }
  if (status === 404) {
    return { message: `${capitalized(what)} nu mai există la acest client.` };
  }
  if (status === 401) {
    return { message: 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.' };
  }
  return { message: `Nu am putut salva ${what}. Verifică conexiunea și încearcă din nou.` };
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
