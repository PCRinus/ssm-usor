import { createRouter } from '../../router';
import {
  archiveResponsiblePerson,
  archiveWorkplace,
  createResponsiblePerson,
  createWorkplace,
  getClientDocumentDetails,
  getOrganizationLegalDetails,
  listResponsiblePersons,
  listWorkplaces,
  updateClientDocumentDetails,
  updateOrganizationLegalDetails,
  updateResponsiblePerson,
  updateWorkplace,
} from './handlers';
import {
  archiveResponsiblePersonRoute,
  archiveWorkplaceRoute,
  createResponsiblePersonRoute,
  createWorkplaceRoute,
  getClientDocumentDetailsRoute,
  getOrganizationLegalDetailsRoute,
  listResponsiblePersonsRoute,
  listWorkplacesRoute,
  updateClientDocumentDetailsRoute,
  updateOrganizationLegalDetailsRoute,
  updateResponsiblePersonRoute,
  updateWorkplaceRoute,
} from './routes';

export const documentDataRouter = createRouter()
  .openapi(getOrganizationLegalDetailsRoute, getOrganizationLegalDetails)
  .openapi(updateOrganizationLegalDetailsRoute, updateOrganizationLegalDetails)
  .openapi(getClientDocumentDetailsRoute, getClientDocumentDetails)
  .openapi(updateClientDocumentDetailsRoute, updateClientDocumentDetails)
  .openapi(listWorkplacesRoute, listWorkplaces)
  .openapi(createWorkplaceRoute, createWorkplace)
  .openapi(updateWorkplaceRoute, updateWorkplace)
  .openapi(archiveWorkplaceRoute, archiveWorkplace)
  .openapi(listResponsiblePersonsRoute, listResponsiblePersons)
  .openapi(createResponsiblePersonRoute, createResponsiblePerson)
  .openapi(updateResponsiblePersonRoute, updateResponsiblePerson)
  .openapi(archiveResponsiblePersonRoute, archiveResponsiblePerson);
