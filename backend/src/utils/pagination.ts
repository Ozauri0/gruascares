export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/** Lee ?page y ?limit con valores seguros (límite máximo para no devolver tablas completas). */
export function parsePagination(query: Record<string, unknown>, defaults: { limit: number; maxLimit: number }): Pagination {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(defaults.maxLimit, Math.max(1, Math.floor(Number(query.limit)) || defaults.limit));
  return { page, limit, offset: (page - 1) * limit };
}
