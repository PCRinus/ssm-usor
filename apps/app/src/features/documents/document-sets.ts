import {
  type DocumentSet,
  documentSetOf,
  type DocumentTypeKey,
  type FireSafetyDocumentTypeKey,
} from '@ssm-usor/contracts';
import { linkOptions } from '@tanstack/react-router';

import { type SectionIdOf, sectionOf } from './document-sections';

export function documentsLink<Set extends DocumentSet>(
  set: Set,
  clientId: string,
  section?: SectionIdOf<Set>
) {
  return set === 'fire_safety'
    ? linkOptions({
        to: '/clients/$clientId/fire-safety-documents',
        params: { clientId },
        search: { section: section as SectionIdOf<'fire_safety'> | undefined },
      })
    : linkOptions({
        to: '/clients/$clientId/documents',
        params: { clientId },
        search: { section: section as SectionIdOf<'occupational_safety'> | undefined },
      });
}

export function documentRowLink(clientId: string, typeKey: string) {
  return documentSetOf(typeKey) === 'fire_safety'
    ? linkOptions({
        to: '/clients/$clientId/fire-safety-documents',
        params: { clientId },
        search: {
          section: sectionOf(typeKey, 'fire_safety'),
          focus: typeKey as FireSafetyDocumentTypeKey,
        },
      })
    : linkOptions({
        to: '/clients/$clientId/documents',
        params: { clientId },
        search: { section: sectionOf(typeKey), focus: typeKey as DocumentTypeKey },
      });
}

export const documentRowId = (typeKey: string) => `document-${typeKey}`;

export function documentLink(set: DocumentSet, clientId: string, documentId: string) {
  return set === 'fire_safety'
    ? linkOptions({
        to: '/clients/$clientId/fire-safety-documents/$documentId',
        params: { clientId, documentId },
      })
    : linkOptions({
        to: '/clients/$clientId/documents/$documentId',
        params: { clientId, documentId },
      });
}

// Left out for the occupational safety set, the API's default, so that its query keys stay the
// ones every other reader of that list uses.
export const setParams = (set: DocumentSet) =>
  set === 'occupational_safety' ? undefined : { set };

export const documentSetCopy = {
  occupational_safety: {
    tab: 'Documente SSM',
    heading: 'Documentația SSM',
    backLabel: 'Înapoi la documentele SSM',
    name: 'SSM',
    emptyHint:
      'Generează documentația ca să obții deciziile, materialele de instruire, testele, registrele și celelalte documente, completate cu datele clientului.',
    templatesUnavailable: undefined,
  },
  fire_safety: {
    tab: 'Documente PSI',
    heading: 'Documentația PSI',
    backLabel: 'Înapoi la documentele PSI',
    name: 'PSI',
    emptyHint:
      'Generează documentația ca să obții registrele și formularele. Documentele în pregătire vor putea fi generate pe măsură ce sunt adăugate în aplicație.',
    templatesUnavailable:
      'Documentele PSI nu pot fi generate încă: șabloanele lor nu sunt disponibile. Nu a fost generat niciun document.',
  },
} as const satisfies Record<
  DocumentSet,
  {
    tab: string;
    heading: string;
    backLabel: string;
    name: string;
    emptyHint: string;
    templatesUnavailable: string | undefined;
  }
>;
