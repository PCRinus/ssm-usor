import { createRouter } from '../../router';
import { acknowledgeReleases, getRelease, listReleases } from './handlers';
import { acknowledgeReleasesRoute, getReleaseRoute, listReleasesRoute } from './routes';

export const releasesRouter = createRouter()
  .openapi(listReleasesRoute, listReleases)
  .openapi(acknowledgeReleasesRoute, acknowledgeReleases)
  .openapi(getReleaseRoute, getRelease);
