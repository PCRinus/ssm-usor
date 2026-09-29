import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouteContext, useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import {
  getGetClientQueryKey,
  getListClientsQueryKey,
  useCreateClient,
  useUpdateClient,
} from '../api/generated/api';
import {
  type Client,
  clientFormSchema,
  type ClientFormValues,
  type ClientStage,
  emptyClientForm,
  toClientForm,
  toCreateClientRequest,
  toUpdateClientRequest,
} from './client-form-schema';
import { clientWording, reportClientSaveError } from './client-save-error';
import { useCompanyLookup } from './use-company-lookup';

// With a client, the form corrects what was entered about it; without, it adds one, in the
// stage it is given.
export function useClientForm(client?: Client, newStage: ClientStage = 'client') {
  const stage = client?.stage ?? newStage;
  const words = clientWording[stage];
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const router = useRouter();
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: client ? toClientForm(client) : emptyClientForm,
  });
  const create = useCreateClient({ request: apiRequest });
  const update = useUpdateClient({ request: apiRequest });
  const { lookup, lookupCui } = useCompanyLookup(form);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (client) {
        const saved = await update.mutateAsync({
          clientId: client.id,
          data: toUpdateClientRequest(values, stage),
        });
        // The client page reads the record through its loader, which keeps whatever is cached.
        queryClient.setQueriesData({ queryKey: getGetClientQueryKey(client.id) }, saved);
        await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        await router.invalidate();
        toast.success(words.saved);
        await (stage === 'lead'
          ? navigate({ to: '/leads/$leadId', params: { leadId: client.id } })
          : navigate({ to: '/clients/$clientId/employees', params: { clientId: client.id } }));
        return;
      }
      const created = await create.mutateAsync({ data: toCreateClientRequest(values, stage) });
      await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      toast.success(words.added(created.client.legalName));
      // A lead opens, because its notes are on its page. The clients list is sorted and
      // paged, so the new row may not be in sight: the toast says it is there.
      await (stage === 'lead'
        ? navigate({ to: '/leads/$leadId', params: { leadId: created.client.id } })
        : navigate({ to: '/clients' }));
    } catch (cause) {
      reportClientSaveError(form, cause, stage);
    }
  });

  return {
    form,
    onSubmit,
    lookup,
    lookupCui,
    stage,
    isSaving: create.isPending || update.isPending,
  };
}
