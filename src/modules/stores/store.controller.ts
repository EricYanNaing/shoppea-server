import type { RequestHandler } from 'express';
import { apiResponse } from '../../utils/api-response.js';
import { findStoreBySlug, listStores } from './store.service.js';
import type { StoreListQuery, StoreSlugParams } from './store.validation.js';

export const getStores: RequestHandler = async (_req, res) => {
  const result = await listStores(res.locals.query as StoreListQuery);
  res.status(200).json(apiResponse('Stores retrieved successfully', result.data, result.meta));
};

export const getStore: RequestHandler = async (_req, res) => {
  const { slug } = res.locals.params as StoreSlugParams;
  const store = await findStoreBySlug(slug);
  res.status(200).json(apiResponse('Store retrieved successfully', store));
};
