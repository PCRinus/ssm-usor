import type { AdminImportFlags, ImportKind, ImportStatus } from '@ssm-usor/contracts';

// Bucharest, where the members and the support work, whatever the admin's machine says.
const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Bucharest',
});
const date = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeZone: 'Europe/Bucharest',
});

export const formatDateTime = (value: string | null) =>
  value ? dateTime.format(new Date(value)) : '—';

export const formatDate = (value: string | null) => (value ? date.format(new Date(value)) : '—');

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
