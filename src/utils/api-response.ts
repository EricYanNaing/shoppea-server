export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function apiResponse<T>(message: string, data: T, meta?: PaginationMeta) {
  return { success: true as const, message, data, ...(meta ? { meta } : {}) };
}
