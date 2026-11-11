import type { AdminImportFlags, ImportKind, ImportStatus } from '@ssm-usor/contracts';

export { formatDate, formatDateTime } from '@/lib/format';

export const formatCost = (value: number | null) => (value === null ? '—' : `$${value.toFixed(2)}`);

export const formatShare = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

export function formatBytes(value: number | null) {
  if (value === null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export const kindLabels: Record<ImportKind, string> = {
  client: 'Client',
  employees: 'Employees',
};

export const statusLabels: Record<ImportStatus, string> = {
  uploading: 'Uploading',
  preparing: 'Preparing',
  sorting: 'Sorting',
  reading: 'Reading',
  checking: 'Checking',
  ready: 'In review',
  confirmed: 'Confirmed',
  abandoned: 'Abandoned',
  failed: 'Failed',
};

export const partLabels: Record<string, string> = {
  instructions_ssm: 'Own instructions, SSM',
  instructions_su: 'Own instructions, SU',
  risk_evaluations: 'Risk evaluations',
};

export function flagSummary(flags: AdminImportFlags | null) {
  if (!flags) return [];
  return [
    { key: 'unreadable', count: flags.unreadableFiles, label: 'unreadable' },
    { key: 'nothing', count: flags.nothingFound, label: 'nothing found' },
    { key: 'empty', count: flags.emptyRequired, label: 'empty required' },
    { key: 'checks', count: flags.checks, label: 'checks' },
  ].filter((flag) => flag.count > 0);
}

export const incompleteCopyExplanation =
  'The copy has not finished writing; the daily clean-up retries it.';

// The clean-up writes copies again only for imports whose row it still finds.
export const incompleteCopyOfDeletedRow =
  'The copy did not finish writing, and with the import’s row gone the clean-up will not retry it.';
