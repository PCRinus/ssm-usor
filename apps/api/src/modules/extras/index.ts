import { createRouter } from '../../router';
import { setExtra } from './handlers';
import { setExtraRoute } from './routes';

export const extrasRouter = createRouter().openapi(setExtraRoute, setExtra);
