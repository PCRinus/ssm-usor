import { createRouter } from '../../router';
import {
  changeMemberRole,
  createOrganization,
  getOrganizationSeats,
  listOrganizationMembers,
  removeMember,
} from './handlers';
import {
  changeMemberRoleRoute,
  createOrganizationRoute,
  getOrganizationSeatsRoute,
  listOrganizationMembersRoute,
  removeMemberRoute,
} from './routes';

export const organizationRouter = createRouter()
  .openapi(createOrganizationRoute, createOrganization)
  .openapi(listOrganizationMembersRoute, listOrganizationMembers)
  .openapi(getOrganizationSeatsRoute, getOrganizationSeats)
  .openapi(changeMemberRoleRoute, changeMemberRole)
  .openapi(removeMemberRoute, removeMember);
