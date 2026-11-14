import type { HistoryState, ParsedLocation } from '@tanstack/react-router';

type ParsedHistoryState = ParsedLocation['state'];

// The opener's history index, not its href: going back through history to it returns it as it
// was left, scroll and its own opener included, however many tabs the record went through.
export const openedHere = (current: ParsedHistoryState): HistoryState => ({
  opener: current.__TSR_index,
});

// The index alone does not say what the opener was. A page that finishes by returning to the
// record it was opened from, as an edit form after saving, needs the record's path as well.
export const openedFromRecord =
  (record: string) =>
  (current: ParsedHistoryState): HistoryState => ({
    opener: current.__TSR_index,
    openerRecord: record,
  });

export const keepOpener = (current: ParsedHistoryState): HistoryState =>
  current.opener === undefined
    ? {}
    : current.openerRecord === undefined
      ? { opener: current.opener }
      : { opener: current.opener, openerRecord: current.openerRecord };

export function stepsBackToOpener(state: ParsedHistoryState, record?: string) {
  const { opener, __TSR_index: index } = state;
  if (record !== undefined && state.openerRecord !== record) return null;
  return typeof opener === 'number' && opener < index ? opener - index : null;
}
