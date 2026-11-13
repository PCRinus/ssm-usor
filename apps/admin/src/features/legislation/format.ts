import type {
  AdminLegalChangeListItem,
  LegalActStatus,
  LegalAmendedUnit,
  LegalChangeOutcome,
  LegalChangePassage,
  LegalChangeResolution,
  LegalCheckRunStatus,
  TemplateVersionKind,
} from '@ssm-usor/contracts';

export const portalPage = (portalId: number) =>
  `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

export const outcomeLabels: Record<LegalChangeOutcome, string> = {
  no_impact: 'No impact',
  quote_differs: 'Quote differs',
  needs_review: 'Needs review',
};

export const resolutionLabels: Record<LegalChangeResolution, string> = {
  open: 'Open',
  no_impact: 'No impact',
  template_version: 'Template version',
};

export const statusLabels: Record<LegalActStatus, string> = {
  in_force: 'In force',
  repealed: 'Repealed',
};

export const runStatusLabels: Record<LegalCheckRunStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
};

export const operationLabels: Record<LegalAmendedUnit['operation'], string> = {
  modified: 'modified',
  supplemented: 'supplemented',
  inserted: 'inserted',
  repealed: 'repealed',
  other: 'amended',
};

export const passageStatusLabels: Record<LegalChangePassage['status'], string> = {
  changed: 'Changed',
  added: 'Added',
  repealed: 'Repealed',
  missing: 'Missing from both forms',
};

export const versionKindLabels: Record<TemplateVersionKind, string> = {
  legal: 'Legal',
  correction: 'Correction',
  layout: 'Layout',
};

// The portal's own date of the form: a calendar day, never moved by a time zone.
const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });

export const formatDay = (value: string | null) =>
  value ? day.format(new Date(`${value}T00:00:00Z`)) : '—';

export const amendingActsOf = (
  change: Pick<AdminLegalChangeListItem, 'amendingActs' | 'amendingAct'>
) =>
  change.amendingActs.length > 0
    ? change.amendingActs
    : change.amendingAct
      ? [{ name: change.amendingAct, adoptedOn: null, portalId: null }]
      : [];
