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
  type SigningAgreementFacts,
  type SigningCodeChannel,
  type SigningRegulationAnnexData,
  signingRegulationAnnexData,
  signingTypeKeys,
} from './signing';
export { instructionModuleSkeleton } from './skeleton';
export { documentText } from './text';
