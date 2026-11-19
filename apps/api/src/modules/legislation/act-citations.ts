import { documentSetOf, type LegalActDomain, type LegalChangeDocument } from '@ssm-usor/contracts';
import { citationIndex, legalActs } from '@ssm-usor/document-engine/citations';
import { templateOfType } from '@ssm-usor/document-engine/template-files';

type Citation = Pick<
  ReturnType<typeof citationIndex>[number],
  'act' | 'manifest' | 'typeKey' | 'form'
>;
type BundledAct = Pick<ReturnType<typeof legalActs>[number], 'id' | 'title'>;

export interface ActCitations {
  subject: string | null;
  domains: LegalActDomain[];
  citedIn: { documents: number; quotes: number };
}

const domainOf: Record<Citation['manifest'], LegalActDomain | null> = {
  ssm: 'ssm',
  fire: 'su',
  other: null,
};

const adoptedOn = / din \d{1,2} [a-z]+ \d{4}/g;

// A joint order names two ministers, each with a number and a date, so the subject starts after
// the last date. A title that names the act before its number, "Legea drepturilor pacientului
// nr. 46 din …", has nothing after it.
export function actSubject(title: string | null) {
  if (!title) return null;
  const dates = [...title.matchAll(adoptedOn)];
  const last = dates.at(-1);
  if (!last) return title;
  const after = title
    .slice(last.index + last[0].length)
    .replace(/^\s*–\s*/, '')
    .trim();
  return after || title.slice(0, title.indexOf(' nr. ')).trim() || title;
}

export function summarizeCitations(acts: readonly BundledAct[], citations: readonly Citation[]) {
  const cited = new Map<
    string,
    { domains: Set<LegalActDomain>; documents: Set<string>; quotes: number }
  >();
  for (const citation of citations) {
    const entry = cited.get(citation.act) ?? {
      domains: new Set(),
      documents: new Set(),
      quotes: 0,
    };
    const domain = domainOf[citation.manifest];
    if (domain) entry.domains.add(domain);
    entry.documents.add(citation.typeKey);
    if (citation.form === 'quote') entry.quotes += 1;
    cited.set(citation.act, entry);
  }
  return new Map<string, ActCitations>(
    acts.map((act) => {
      const entry = cited.get(act.id);
      return [
        act.id,
        {
          subject: actSubject(act.title),
          domains: (['ssm', 'su'] as const).filter((domain) => entry?.domains.has(domain)),
          citedIn: { documents: entry?.documents.size ?? 0, quotes: entry?.quotes ?? 0 },
        },
      ];
    })
  );
}

let bundled: Map<string, ActCitations> | undefined;

export function bundledActCitations() {
  bundled ??= summarizeCitations(legalActs(), citationIndex());
  return bundled;
}

export const notCited: ActCitations = {
  subject: null,
  domains: [],
  citedIn: { documents: 0, quotes: 0 },
};

const collator = new Intl.Collator('ro');

export function documentOfType(typeKey: string): LegalChangeDocument | null {
  const template = templateOfType(typeKey);
  return template && { typeKey, title: template.title, set: documentSetOf(typeKey) };
}

export function citingDocuments(citations: readonly Pick<Citation, 'act' | 'typeKey'>[]) {
  const typeKeysOf = new Map<string, Set<string>>();
  for (const citation of citations) {
    typeKeysOf.set(citation.act, (typeKeysOf.get(citation.act) ?? new Set()).add(citation.typeKey));
  }
  return new Map(
    [...typeKeysOf].map(([act, typeKeys]) => [
      act,
      [...typeKeys]
        .flatMap((typeKey) => documentOfType(typeKey) ?? [])
        .sort((a, b) => collator.compare(a.title, b.title)),
    ])
  );
}

let bundledCiting: Map<string, LegalChangeDocument[]> | undefined;

export function bundledCitingDocuments() {
  bundledCiting ??= citingDocuments(citationIndex());
  return bundledCiting;
}
