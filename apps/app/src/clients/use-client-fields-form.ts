import { zodResolver } from '@hookform/resolvers/zod';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import {
  getGetClientQueryKey,
  getGetServiceContractQueryKey,
  getListClientsQueryKey,
  type UpdateClientRequest,
  useUpdateClient,
} from '../api/generated/api';
import { useSavedToast } from '../missing-data/saved-toast';
import {
  type Client,
  clientFormSchema,
  type ClientFormValues,
  toClientForm,
  toUpdateClientRequest,
} from './client-form-schema';
import { reportClientSaveError } from './client-save-error';

const contactFields = ['contactName', 'contactEmail', 'contactPhone'] as const;

// The update route replaces the registration data whole but keeps a contact field left out: a
// card sends its fields over the record as it is now, and the contact only from its own card.
export function useClientFieldsForm({
  client,
  fields,
  successMessage,
  onSaved,
}: {
  client: Client;
  fields: readonly (keyof ClientFormValues)[];
  successMessage: string;
  onSaved: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const router = useRouter();
  const update = useUpdateClient({ request: apiRequest });
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: toClientForm(client),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const own = Object.fromEntries(fields.map((field) => [field, values[field]]));
    const data: Partial<UpdateClientRequest> = toUpdateClientRequest(
      { ...toClientForm(client), ...own },
      client.stage
    );
    for (const field of contactFields) if (!fields.includes(field)) delete data[field];
    try {
      const saved = await update.mutateAsync({
        clientId: client.id,
        data: data as UpdateClientRequest,
      });
      // The client and lead pages read the record through loaders, which keep what is cached.
      queryClient.setQueriesData({ queryKey: getGetClientQueryKey(client.id) }, saved);
      await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      // The contract card on the lead page lists what it still misses from these fields. Not
      // awaited: a contract that fails to load must not hold back the save.
      void queryClient.invalidateQueries({ queryKey: getGetServiceContractQueryKey(client.id) });
      await router.invalidate();
      savedToast(successMessage);
      onSaved();
    } catch (cause) {
      reportClientSaveError(form, cause, client.stage, new Set(fields));
    }
  });

  return { form, onSubmit, isSaving: update.isPending };
}
