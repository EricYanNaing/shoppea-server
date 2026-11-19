import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware.js';
import { getStore, getStores } from './store.controller.js';
import { storeListSchema, storeSlugSchema } from './store.validation.js';

export const storeRouter = Router();
storeRouter.get('/', validate(storeListSchema, 'query'), getStores);
storeRouter.get('/:slug', validate(storeSlugSchema, 'params'), getStore);
