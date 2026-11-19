import type { BillingChoice } from '@ssm-usor/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { previewBilling } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { useAuth } from '@/features/auth/auth-context';

import { billingPreviewKey } from './use-billing';

const settleMs = 250;

// Waits for the steppers to settle, so five quick clicks ask for one preview, not five.
function useSettled(choice: BillingChoice | null) {
  const [settled, setSettled] = useState(choice);
  const key = JSON.stringify(choice);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(JSON.parse(key) as BillingChoice | null), settleMs);
    return () => clearTimeout(timer);
  }, [key]);
  return settled;
}

export function useBillingPreview(choice: BillingChoice | null) {
  const { session } = useAuth();
  const { request } = useApi();
  const settled = useSettled(choice);
  const query = useQuery({
    queryKey: [...billingPreviewKey, session?.user.id, settled],
    queryFn: () => previewBilling(settled!, request),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const settling = JSON.stringify(settled) !== JSON.stringify(choice) || query.isPlaceholderData;
  return { preview: query, settling };
}
