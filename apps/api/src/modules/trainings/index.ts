import { createRouter } from '../../router';
import {
  createTraining,
  deleteTraining,
  getTraining,
  getTrainingProposal,
  listEmployeeTrainingRecords,
  listTrainings,
  updateTraining,
} from './handlers';
import {
  createTrainingRoute,
  deleteTrainingRoute,
  getTrainingProposalRoute,
  getTrainingRoute,
  listEmployeeTrainingRecordsRoute,
  listTrainingsRoute,
  updateTrainingRoute,
} from './routes';

// The proposal before the training's own path, which would otherwise take "proposal" for an id.
export const trainingsRouter = createRouter()
  .openapi(listTrainingsRoute, listTrainings)
  .openapi(getTrainingProposalRoute, getTrainingProposal)
  .openapi(createTrainingRoute, createTraining)
  .openapi(getTrainingRoute, getTraining)
  .openapi(updateTrainingRoute, updateTraining)
  .openapi(deleteTrainingRoute, deleteTraining)
  .openapi(listEmployeeTrainingRecordsRoute, listEmployeeTrainingRecords);
