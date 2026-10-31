import { useEffect, useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';

import { isUploadStalled, uploadStallsAt } from './import-format';

export function useUploadStalled(detail: ImportDetail) {
  const [now, setNow] = useState(Date.now);
  const stalled = isUploadStalled(detail, now);
  useEffect(() => {
    if (detail.status !== 'uploading' || stalled) return;
    const timer = setTimeout(() => setNow(Date.now()), uploadStallsAt(detail) - Date.now());
    return () => clearTimeout(timer);
  }, [detail, stalled]);
  return stalled;
}
