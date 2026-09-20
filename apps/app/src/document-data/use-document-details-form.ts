import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import {
  type ClientDocumentDetailsResponse,
  getGetClientDocumentDetailsQueryKey,
  getGetClientQueryKey,
  useUpdateClientDocumentDetails,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import {
  documentDetailsFormSchema,
  type DocumentDetailsFormValues,
  toDocumentDetailsForm,
  toDocumentDetailsRequest,
} from './document-details-schema';

export type DocumentDetails = ClientDocumentDetailsResponse['documentDetails'];

export interface ClientSummary {
  id: string;
  archivedAt: string | null;
}

export type DocumentDetailsField = keyof DocumentDetailsFormValues;

// The route replaces every field, and two cards each edit their own. A card sends its fields
// over what is saved now, not over what was saved when it mounted, so saving one card never
// takes back what the other saved in the meantime.
export function useDocumentDetailsForm({
  saved,
  client,
  userId,
  fields,
  successMessage,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
  fields: readonly DocumentDetailsField[];
  successMessage: string;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateClientDocumentDetails({ request: apiRequest });
  const form = useForm<DocumentDetailsFormValues>({
    resolver: zodResolver(documentDetailsFormSchema),
    defaultValues: toDocumentDetailsForm(saved),
  });
  const busy = update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const own = Object.fromEntries(fields.map((field) => [field, values[field]]));
    const data = toDocumentDetailsRequest({ ...toDocumentDetailsForm(saved), ...own });
    try {
      await update.mutateAsync({ clientId: client.id, data });
      // The client itself carries the representative's name too.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...getGetClientDocumentDetailsQueryKey(client.id), userId],
        }),
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(client.id) }),
      ]);
      toast.success(successMessage);
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Clientul nu mai există în organizația ta.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva datele. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return {
    form,
    onSubmit,
    busy,
    // An archived client keeps its data; nothing about it is edited any more.
    locked: busy || client.archivedAt !== null,
  };
}

export const describedBy = (id: string, error: unknown, hint = false) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;
