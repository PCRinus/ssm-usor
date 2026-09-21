import { createRouter } from '../../router';
import {
  archiveResponsiblePerson,
  archiveWorkplace,
  createResponsiblePerson,
  createWorkplace,
  getClientDocumentDetails,
  getOrganizationAuthorizations,
  getOrganizationCompanyDetails,
  listResponsiblePersons,
  listWorkplaces,
  updateClientDocumentDetails,
  updateOrganizationAuthorizations,
  updateOrganizationCompanyDetails,
  updateResponsiblePerson,
  updateWorkplace,
} from './handlers';
import {
  archiveResponsiblePersonRoute,
  archiveWorkplaceRoute,
  createResponsiblePersonRoute,
  createWorkplaceRoute,
  getClientDocumentDetailsRoute,
  getOrganizationAuthorizationsRoute,
  getOrganizationCompanyDetailsRoute,
  listResponsiblePersonsRoute,
  listWorkplacesRoute,
  updateClientDocumentDetailsRoute,
  updateOrganizationAuthorizationsRoute,
  updateOrganizationCompanyDetailsRoute,
  updateResponsiblePersonRoute,
  updateWorkplaceRoute,
} from './routes';

export const documentDataRouter = createRouter()
  .openapi(getOrganizationCompanyDetailsRoute, getOrganizationCompanyDetails)
  .openapi(updateOrganizationCompanyDetailsRoute, updateOrganizationCompanyDetails)
  .openapi(getOrganizationAuthorizationsRoute, getOrganizationAuthorizations)
  .openapi(updateOrganizationAuthorizationsRoute, updateOrganizationAuthorizations)
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
