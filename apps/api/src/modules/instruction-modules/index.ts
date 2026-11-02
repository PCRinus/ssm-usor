import { createRouter } from '../../router';
import {
  applyPositionInstructions,
  copyPositionInstructions,
  createInstructionModule,
  decidePositionInstructions,
  downloadInstructionModule,
  getInstructionModule,
  getInstructionModuleVersion,
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
  decidePositionInstructionsRoute,
  downloadInstructionModuleRoute,
  getInstructionModuleRoute,
  getInstructionModuleVersionRoute,
  listInstructionModulesRoute,
  listPositionInstructionsRoute,
  previewInstructionRoute,
  saveInstructionBodyRoute,
  updateInstructionModuleRoute,
} from './routes';

export const instructionModulesRouter = createRouter()
  .openapi(listInstructionModulesRoute, listInstructionModules)
  .openapi(createInstructionModuleRoute, createInstructionModule)
  // Before the routes of one module: `/instruction-modules/preview` is not a module id.
  .openapi(previewInstructionRoute, previewInstruction)
  .openapi(getInstructionModuleRoute, getInstructionModule)
  .openapi(updateInstructionModuleRoute, updateInstructionModule)
  .openapi(saveInstructionBodyRoute, saveInstructionBody)
  .openapi(getInstructionModuleVersionRoute, getInstructionModuleVersion)
  .openapi(downloadInstructionModuleRoute, downloadInstructionModule)
  .openapi(listPositionInstructionsRoute, listPositionInstructions)
  .openapi(applyPositionInstructionsRoute, applyPositionInstructions)
  .openapi(copyPositionInstructionsRoute, copyPositionInstructions)
  .openapi(decidePositionInstructionsRoute, decidePositionInstructions);
