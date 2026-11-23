import type { RiskZoneRequest, RiskZonesResponse } from '@ssm-usor/contracts';
import { useState } from 'react';

import {
  createRiskZone,
  getGetDocumentReadinessQueryKey,
  getListRiskZonesQueryKey,
  ignoreRiskZoneSuggestion,
  removeRiskZone,
  restoreRiskZoneSuggestion,
  updateRiskZone,
  updateRiskZonesState,
  useListRiskZones,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { zoneFailure } from './risk-zone-model';

const fallback = 'Nu am putut salva schimbarea. Verifică conexiunea și încearcă din nou.';

export function useRiskZones(clientId: string) {
  const { request, key, queryClient } = useApi();
  const queryKey = key(getListRiskZonesQueryKey(clientId));
  const zones = useListRiskZones(clientId, { request, query: { queryKey } });
  const savedToast = useSavedToast();
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // `action` names what runs, so only its button says so. A failure is also thrown, for a form
  // to show it in place.
  async function run(
    action: string,
    call: () => Promise<RiskZonesResponse>,
    message: string,
    { rethrow = false } = {}
  ) {
    setFailure(null);
    setPending(action);
    try {
      queryClient.setQueryData(queryKey, await call());
      savedToast(message);
    } catch (cause) {
      if (!rethrow) setFailure(zoneFailure(cause, fallback));
      await queryClient.invalidateQueries({ queryKey });
      if (rethrow) throw cause;
    } finally {
      setPending(null);
      await queryClient.invalidateQueries({
        queryKey: getGetDocumentReadinessQueryKey(clientId),
      });
    }
  }

  return {
    zones,
    pending,
    failure,
    save: (zoneId: string | null, body: RiskZoneRequest, message: string) =>
      run(
        zoneId ? `save:${zoneId}` : 'add',
        () =>
          zoneId
            ? updateRiskZone(clientId, zoneId, body, request)
            : createRiskZone(clientId, body, request),
        message,
        { rethrow: true }
      ),
    quickSave: (action: string, zoneId: string | null, body: RiskZoneRequest, message: string) =>
      run(
        action,
        () =>
          zoneId
            ? updateRiskZone(clientId, zoneId, body, request)
            : createRiskZone(clientId, body, request),
        message
      ),
    remove: (zoneId: string) =>
      run(
        `remove:${zoneId}`,
        () => removeRiskZone(clientId, zoneId, request),
        'Zona a fost ștearsă.'
      ),
    declare: (state: 'none' | 'undecided') =>
      run(
        'declare',
        () => updateRiskZonesState(clientId, { state }, request),
        state === 'none'
          ? 'Am notat că clientul nu are zone cu risc ridicat și specific.'
          : 'Întrebarea despre zonele cu risc ridicat și specific este din nou deschisă.'
      ),
    ignore: (action: string, factorIds: string[]) =>
      run(
        action,
        () => ignoreRiskZoneSuggestion(clientId, { factorIds }, request),
        'Sugestia a fost ignorată.'
      ),
    restore: (action: string, factorIds: string[]) =>
      run(
        action,
        () => restoreRiskZoneSuggestion(clientId, { factorIds }, request),
        'Sugestia a revenit printre sugestii.'
      ),
  };
}

export type RiskZonesStore = ReturnType<typeof useRiskZones>;
