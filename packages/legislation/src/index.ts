export {
  type ActText,
  type ActUnit,
  fetchActText,
  type FetchedActText,
  hasActText,
  parseActText,
  textLink,
  type UnitKind,
  unitLines,
  type UnitMatch,
  unitsOf,
} from './act-text';
export {
  type AmendingAct,
  type AmendmentNote,
  type AmendmentOperation,
  parseNote,
  type UnitPath,
} from './amendments';
export {
  type ActOutcome,
  checkLegislation,
  type CheckOptions,
  describeOutcome,
  type Failure,
  type FailureKind,
  isNewer,
  type LegalAct,
  legalActsSchema,
  summarize,
  tally,
} from './check';
export {
  createLegislationClient,
  type Json,
  type LegislationClient,
  type LegislationDatabase,
  type LegislationTables,
} from './database';
export {
  describeAct,
  fetchPortalAct,
  type PortalAct,
  type PortalAction,
  type PortalEnv,
  PortalError,
  type PortalFailure,
  type PortalOptions,
  portalOptionsFromEnv,
  type PortalPage,
  type PortalStatus,
} from './portal';
export {
  type CheckRun,
  describeRun,
  runCutOffAfterMs,
  type RunError,
  runInProgress,
  runLegislationCheck,
  type RunOptions,
} from './run';
