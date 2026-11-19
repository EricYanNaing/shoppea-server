import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { publicStoreSelect, listStores } from '../src/modules/stores/store.service.js';

const date = new Date('2026-01-01T00:00:00Z');
const store = {
  id: 'store-1', name: 'Fashion Shop', slug: 'fashion-shop',
  description: null, logoUrl: null, bannerUrl: null,
  status: 'ACTIVE' as const, createdAt: date, updatedAt: date,
};

beforeEach(() => {
  vi.mocked(prisma.store.findMany< { select: typeof publicStoreSelect } >).mockResolvedValue([store]);
  vi.mocked(prisma.store.count).mockResolvedValue(11);
  vi.mocked(prisma.store.findFirst< { select: typeof publicStoreSelect } >).mockResolvedValue(store);
});

describe('HTTP foundation', () => {
  it('returns the exact health response', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Server is running', data: { status: 'ok' } });
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });
  it('returns a consistent unmatched-route error', async () => {
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
  it('rejects malformed JSON', async () => {
    const res = await request(app).post('/missing').set('Content-Type', 'application/json').send('{');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
  it('does not expose unexpected database error details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.store.findFirst< { select: typeof publicStoreSelect } >).mockRejectedValueOnce(new Error('mysql://secret-password'));
    const res = await request(app).get('/api/v1/stores/fashion-shop');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal server error', error: { code: 'INTERNAL_SERVER_ERROR' } });
  });
});

describe('store listing', () => {
  it('returns stores with default pagination and stable ordering', async () => {
    const res = await request(app).get('/api/v1/stores');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Stores retrieved successfully');
    expect(res.body.data[0].slug).toBe('fashion-shop');
    expect(res.body.meta).toEqual({ page: 1, limit: 10, total: 11, totalPages: 2 });
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' }, select: publicStoreSelect,
      skip: 0, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(prisma.store.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: 'RepeatableRead' });
    expect(publicStoreSelect).not.toHaveProperty('owner');
    expect(res.body.data[0]).not.toHaveProperty('passwordHash');
  });
  it('uses skip/take for page 2 with a limit of 5', async () => {
    const res = await request(app).get('/api/v1/stores?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 2, limit: 5, total: 11, totalPages: 3 });
    expect(prisma.store.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
  });
  it('trims keyword and uses the same filter for rows and count', async () => {
    await request(app).get('/api/v1/stores').query({ keyword: '  FaShIoN  ' });
    const where = { status: 'ACTIVE', name: { contains: 'FaShIoN' } };
    expect(prisma.store.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.store.count).toHaveBeenCalledWith({ where });
  });
  it('escapes SQL LIKE wildcard characters in literal search text', async () => {
    await listStores({ page: 1, limit: 10, keyword: '50%_off' });
    expect(prisma.store.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE', name: { contains: '50\\%\\_off' } } });
  });
  it('ignores a whitespace-only keyword', async () => {
    await request(app).get('/api/v1/stores').query({ keyword: '   ' });
    expect(prisma.store.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
  });
  it('returns zero totalPages for an empty result', async () => {
    vi.mocked(prisma.store.findMany< { select: typeof publicStoreSelect } >).mockResolvedValueOnce([]);
    vi.mocked(prisma.store.count).mockResolvedValueOnce(0);
    const res = await request(app).get('/api/v1/stores');
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalPages).toBe(0);
  });
  it.each(['page=0', 'page=-1', 'page=1.5', 'page=abc', 'page=', 'limit=0', 'limit=101', 'limit=1e2', 'limit=true', 'page=1&page=2', 'keyword=a&keyword=b', 'unknown=value', 'page=9007199254740992', 'page=9007199254740991&limit=100'])('rejects invalid query %s', async (query) => {
    const res = await request(app).get(`/api/v1/stores?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0]).toHaveProperty('field');
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });
});

describe('store detail', () => {
  it('returns an active store by slug', async () => {
    const res = await request(app).get('/api/v1/stores/fashion-shop');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('fashion-shop');
    expect(prisma.store.findFirst).toHaveBeenCalledWith({ where: { slug: 'fashion-shop', status: 'ACTIVE' }, select: publicStoreSelect });
  });
  it.each(['missing-shop', 'draft-shop', 'suspended-shop'])('returns 404 for missing or inactive %s', async (slug) => {
    vi.mocked(prisma.store.findFirst< { select: typeof publicStoreSelect } >).mockResolvedValueOnce(null);
    const res = await request(app).get(`/api/v1/stores/${slug}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Store not found', error: { code: 'STORE_NOT_FOUND' } });
    expect(prisma.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { slug, status: 'ACTIVE' } }));
  });
  it.each(['Invalid_Slug', '-bad', 'bad--slug'])('rejects invalid slug %s', async (slug) => {
    const res = await request(app).get(`/api/v1/stores/${slug}`);
    expect(res.status).toBe(400);
    expect(prisma.store.findFirst).not.toHaveBeenCalled();
  });
  it.each(['post', 'patch', 'put', 'delete'] as const)('does not implement %s store routes', async (method) => {
    const res = await request(app)[method]('/api/v1/stores/fashion-shop');
    expect(res.status).toBe(404);
  });
});
