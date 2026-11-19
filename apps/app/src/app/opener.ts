import type { HistoryState, ParsedLocation } from '@tanstack/react-router';

type ParsedHistoryState = ParsedLocation['state'];

const keepSection = (current: ParsedHistoryState): HistoryState =>
  current.section === undefined ? {} : { section: current.section };

// The opener's history index, not its href: going back through history to it returns it as it
// was left, scroll and its own opener included, however many tabs the record went through.
export const openedHere = (current: ParsedHistoryState): HistoryState => ({
  opener: current.__TSR_index,
});

// A worker lives under its client, so the organization's workers list, which opens workers of
// every client, names itself for the sidebar to keep it highlighted while the worker is open.
// Only links that stay in the record pass it on; a page the record opens is the client's again.
export const openedFromSection =
  (section: NonNullable<HistoryState['section']>) =>
  (current: ParsedHistoryState): HistoryState => ({
    opener: current.__TSR_index,
    section,
  });

// The index alone does not say what the opener was. A page that finishes by returning to the
// record it was opened from, as an edit form after saving, needs the record's path as well.
export const openedFromRecord =
  (record: string) =>
  (current: ParsedHistoryState): HistoryState => ({
    opener: current.__TSR_index,
    openerRecord: record,
    ...keepSection(current),
  });

export const keepOpener = (current: ParsedHistoryState): HistoryState => ({
  ...(current.opener !== undefined && { opener: current.opener }),
  ...(current.opener !== undefined &&
    current.openerRecord !== undefined && { openerRecord: current.openerRecord }),
  ...keepSection(current),
});

export function stepsBackToOpener(state: ParsedHistoryState, record?: string) {
  const { opener, __TSR_index: index } = state;
  if (record !== undefined && state.openerRecord !== record) return null;
  return typeof opener === 'number' && opener < index ? opener - index : null;
}
