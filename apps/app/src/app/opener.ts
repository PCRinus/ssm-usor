import type { HistoryState, ParsedLocation } from '@tanstack/react-router';

type ParsedHistoryState = ParsedLocation['state'];

// The opener's history index, not its href: going back through history to it returns it as it
// was left, scroll and its own opener included, however many tabs the record went through.
export const openedHere = (current: ParsedHistoryState): HistoryState => ({
  opener: current.__TSR_index,
});

export const keepOpener = (current: ParsedHistoryState): HistoryState =>
  current.opener === undefined ? {} : { opener: current.opener };

export function stepsBackToOpener(state: ParsedHistoryState) {
  const { opener, __TSR_index: index } = state;
  return typeof opener === 'number' && opener < index ? opener - index : null;
}
