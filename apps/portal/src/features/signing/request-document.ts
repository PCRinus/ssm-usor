import { useLingui } from '@lingui/react/macro';

import { testSheetTitleMessage, trainingDomainMessages, trainingPhaseMessages } from '@/lib/labels';

import type { PortalSignatureRequest } from './signing-items';

export const documentKeyOf = (request: PortalSignatureRequest) =>
  request.record?.id ?? request.testSheet?.id ?? request.id;

// The API's `label` is Romanian; it names the document only when neither payload came.
export function useRequestDocument() {
  const { t, i18n } = useLingui();
  return (request: PortalSignatureRequest): { title: string; day: string } => {
    const { record, testSheet } = request;
    if (record) {
      const phase = i18n._(trainingPhaseMessages[record.phase]);
      const domain = i18n._(trainingDomainMessages[record.domain]);
      return { title: t`${phase} ${domain}`, day: record.heldOn };
    }
    if (testSheet) {
      return {
        title: i18n._(testSheetTitleMessage(testSheet.domain, testSheet.test)),
        day: testSheet.takenOn,
      };
    }
    return { title: request.label, day: request.issuedAt.slice(0, 10) };
  };
}
