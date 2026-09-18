import { createRouter } from '../../router';
import { changeMemberRole, listOrganizationMembers, removeMember } from './handlers';
import { changeMemberRoleRoute, listOrganizationMembersRoute, removeMemberRoute } from './routes';

export const organizationRouter = createRouter()
  .openapi(listOrganizationMembersRoute, listOrganizationMembers)
  .openapi(changeMemberRoleRoute, changeMemberRole)
  .openapi(removeMemberRoute, removeMember);
