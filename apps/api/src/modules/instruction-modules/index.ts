import { createRouter } from '../../router';
import {
  applyPositionInstructions,
  copyPositionInstructions,
  createInstructionModule,
  downloadInstructionModule,
  getInstructionModule,
  getInstructionModuleVersion,
  listInstructionModuleChoices,
  listInstructionModules,
  listPositionInstructions,
  previewInstruction,
  saveInstructionBody,
  updateInstructionModule,
} from './handlers';
import {
  applyPositionInstructionsRoute,
  copyPositionInstructionsRoute,
  createInstructionModuleRoute,
  downloadInstructionModuleRoute,
  getInstructionModuleRoute,
  getInstructionModuleVersionRoute,
  listInstructionModuleChoicesRoute,
  listInstructionModulesRoute,
  listPositionInstructionsRoute,
  previewInstructionRoute,
  saveInstructionBodyRoute,
  updateInstructionModuleRoute,
} from './routes';

export const instructionModulesRouter = createRouter()
  .openapi(listInstructionModulesRoute, listInstructionModules)
  .openapi(createInstructionModuleRoute, createInstructionModule)
  // Before the routes of one module: `preview` and `choices` are not module ids.
  .openapi(previewInstructionRoute, previewInstruction)
  .openapi(listInstructionModuleChoicesRoute, listInstructionModuleChoices)
  .openapi(getInstructionModuleRoute, getInstructionModule)
  .openapi(updateInstructionModuleRoute, updateInstructionModule)
  .openapi(saveInstructionBodyRoute, saveInstructionBody)
  .openapi(getInstructionModuleVersionRoute, getInstructionModuleVersion)
  .openapi(downloadInstructionModuleRoute, downloadInstructionModule)
  .openapi(listPositionInstructionsRoute, listPositionInstructions)
  .openapi(applyPositionInstructionsRoute, applyPositionInstructions)
  .openapi(copyPositionInstructionsRoute, copyPositionInstructions);
