export { type AnnexDomain, annexTitlePage } from './annex-title';
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
export { countArticles, firstLine, sweepFonts } from './modules';
export * from './render';
export {
  buildSigningAgreementData,
  type SigningAgreementData,
  SigningAgreementDataError,
  type SigningAgreementFacts,
  type SigningCodeChannel,
  signingContractClauseText,
  type SigningRegulationAnnexData,
  signingRegulationAnnexData,
  signingTypeKeys,
} from './signing';
export { instructionModuleSkeleton } from './skeleton';
export {
  buildTestSheetData,
  type TestSheetData,
  type TestSheetFacts,
  testSheetTypeKey,
} from './test-sheet';
export { documentText } from './text';
