import { createRouter } from '../../router';
import {
  changeMemberRole,
  createOrganization,
  listOrganizationMembers,
  removeMember,
} from './handlers';
import {
  changeMemberRoleRoute,
  createOrganizationRoute,
  listOrganizationMembersRoute,
  removeMemberRoute,
} from './routes';

export const organizationRouter = createRouter()
  .openapi(createOrganizationRoute, createOrganization)
  .openapi(listOrganizationMembersRoute, listOrganizationMembers)
  .openapi(changeMemberRoleRoute, changeMemberRole)
  .openapi(removeMemberRoute, removeMember);
