import index from '../templates/citations.json' with { type: 'json' };
import acts from '../templates/legal-acts.json' with { type: 'json' };
import type { ActKind, Citation } from './citations';

export interface LegalAct {
  id: string;
  kind: ActKind;
  number: string;
  year: number;
  name: string;
  title: string | null;
  /** The act's page on legislatie.just.ro is /Public/DetaliiDocument/<portalId>; null until looked up. */
  portalId: number | null;
}

export function citationIndex(): Citation[] {
  return index.citations as Citation[];
}

export function legalActs(): LegalAct[] {
  return acts.acts as LegalAct[];
}
