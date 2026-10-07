import index from '../templates/citations.json' with { type: 'json' };
import type { Citation } from './citations';

export function citationIndex(): Citation[] {
  return index.citations as Citation[];
}
