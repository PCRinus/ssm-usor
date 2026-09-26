import { createRouter } from '../../router';
import {
  applyPositionInstructions,
  copyPositionInstructions,
  createInstructionModule,
  decidePositionInstructions,
  getInstructionModule,
  getInstructionModuleFileLink,
  listInstructionModules,
  listPositionInstructions,
  saveInstructionModuleFile,
  updateInstructionModule,
  uploadInstructionModule,
} from './handlers';
import {
  applyPositionInstructionsRoute,
  copyPositionInstructionsRoute,
  createInstructionModuleRoute,
  decidePositionInstructionsRoute,
  getInstructionModuleRoute,
  instructionModuleFileLinkRoute,
  listInstructionModulesRoute,
  listPositionInstructionsRoute,
  saveInstructionModuleFileRoute,
  updateInstructionModuleRoute,
  uploadInstructionModuleRoute,
} from './routes';

export const instructionModulesRouter = createRouter()
  .openapi(listInstructionModulesRoute, listInstructionModules)
  .openapi(createInstructionModuleRoute, createInstructionModule)
  .openapi(uploadInstructionModuleRoute, uploadInstructionModule)
  .openapi(getInstructionModuleRoute, getInstructionModule)
  .openapi(updateInstructionModuleRoute, updateInstructionModule)
  .openapi(instructionModuleFileLinkRoute, getInstructionModuleFileLink)
  .openapi(saveInstructionModuleFileRoute, saveInstructionModuleFile)
  .openapi(listPositionInstructionsRoute, listPositionInstructions)
  .openapi(applyPositionInstructionsRoute, applyPositionInstructions)
  .openapi(copyPositionInstructionsRoute, copyPositionInstructions)
  .openapi(decidePositionInstructionsRoute, decidePositionInstructions);
