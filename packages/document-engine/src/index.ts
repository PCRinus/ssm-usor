export {
  type AnnexBlock,
  type AnnexBody,
  type AnnexPageCount,
  type AnnexParagraph,
  annexParagraphs,
  appendAnnexes,
  renderAnnex,
} from './annex';
export { type AnnexDomain, annexTemplate } from './annex-template';
export {
  type ActKind,
  type ActName,
  type Citation,
  type CitationForm,
  parseAct,
  parseMarker,
  templateCitations,
  type TemplateSet,
  type TemplateSource,
} from './citations';
export { textWidth } from './content-widths';
export { printableDocx } from './printable';
export * from './render';
export {
  buildSigningAgreementData,
  type SigningAgreementData,
  SigningAgreementDataError,
  type SigningAgreementFacts,
  type SigningCodeChannel,
  signingContractClauseText,
  signingTypeKeys,
} from './signing';
export { ssmDutiesTypeKey, ssmDutiesWording } from './ssm-duties';
export {
  buildTestSheetData,
  type TestSheetData,
  type TestSheetFacts,
  testSheetTypeKey,
} from './test-sheet';
export { documentText, paragraphsOf } from './text';
