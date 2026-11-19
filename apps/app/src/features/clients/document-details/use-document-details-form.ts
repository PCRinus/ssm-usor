import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  type ClientDocumentDetailsResponse,
  getGetClientDocumentDetailsQueryKey,
  getGetClientQueryKey,
  useGetClientDocumentDetails,
  useUpdateClientDocumentDetails,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { useSavedToast } from '@/features/missing-data/saved-toast';
import { commonFailure } from '@/lib/api-errors';

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

export function useDocumentDetails(clientId: string) {
  const { request, key } = useApi();
  return useGetClientDocumentDetails(clientId, {
    request,
    query: { queryKey: key(getGetClientDocumentDetailsQueryKey(clientId)) },
  });
}

export function useDocumentDetailsForm({
  saved,
  client,
  fields,
  successMessage,
  onSaved,
  starting = {},
  refuse,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  fields: readonly DocumentDetailsField[];
  successMessage: string;
  onSaved?: () => void;
  // Values the form opens on that are not saved yet; saving keeps them.
  starting?: Partial<DocumentDetailsFormValues>;
  // The shared form schema checks every card's fields, so a rule for this card's fields only goes here.
  refuse?: (
    values: DocumentDetailsFormValues
  ) => { field: DocumentDetailsField; message: string }[];
}) {
  const { request, queryClient, key } = useApi();
  const savedToast = useSavedToast();
  const update = useUpdateClientDocumentDetails({ request });
  const queryKey = key(getGetClientDocumentDetailsQueryKey(client.id));
  // Saving sends only the card's own fields, so a starting value outside them would show and be lost.
  const opening = Object.fromEntries(
    fields.flatMap((field) => (field in starting ? [[field, starting[field]]] : []))
  );
  const form = useForm<DocumentDetailsFormValues>({
    resolver: zodResolver(documentDetailsFormSchema),
    defaultValues: { ...toDocumentDetailsForm(saved), ...opening },
  });
  const busy = update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const refused = refuse?.(values) ?? [];
    if (refused.length > 0) {
      for (const { field, message } of refused) form.setError(field, { message });
      return;
    }
    try {
      const response = await update.mutateAsync({
        clientId: client.id,
        data: toDocumentDetailsRequest(values, fields),
      });
      // A refetch that fails keeps the cache it had, so the saved row goes in first.
      queryClient.setQueryData(queryKey, response);
      // The client itself carries the representative's name too.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(client.id) }),
      ]);
      savedToast(successMessage);
      onSaved?.();
    } catch (cause) {
      form.setError('root.server', {
        message:
          commonFailure(cause) ??
          (cause instanceof ApiHttpError && cause.status === 404
            ? 'Clientul nu mai există în organizația ta.'
            : 'Nu am putut salva datele. Verifică conexiunea și încearcă din nou.'),
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
