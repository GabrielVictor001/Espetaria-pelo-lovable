export interface User {
  id: number;
  name: string;
  username: string | null;
  role: 'admin' | 'waiter';
}

export interface OrderItem {
  id: number;
  product_id: number;
  name: string;
  category: string | null;
  command_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes: string | null;
  status: 'active' | 'canceled';
  created_at: string;
  added_by_name: string | null;
  canceled_at: string | null;
  canceled_by_name: string | null;
  cancel_reason: string | null;
}

export interface Command {
  name: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  active_count: number;
  canceled_count: number;
}

export interface Order {
  id: number;
  table_id: number;
  table_number: number;
  status: string;
  created_at: string;
  opened_by_name: string | null;
  people_count: number;
  discount: number;
  service_fee: number;
  notes: string | null;
  subtotal: number;
  total: number;
  canceled_total: number;
  items: OrderItem[];
  commands: Command[];
  active_count: number;
  total_count: number;
}

export interface TableSummary {
  id: number;
  number: number;
  status: 'free' | 'occupied' | 'closing';
  seats: number;
  zone: string;
  updated_at: string;
  occupied: boolean;
  order: null | {
    id: number;
    opened_at: string;
    people_count: number;
    waiter_name: string | null;
    items_count: number;
    items_quantity: number;
    items_preview: string | null;
    subtotal: number;
    service_fee: number;
    discount: number;
    total: number;
    minutes_open: number;
  };
}

export interface Product {
  id: number;
  name: string;
  price: number | string;
  price_number: number;
  category: string | null;
  description: string | null;
  keywords: string | null;
  active: boolean;
  favorite: boolean;
  sort_order: number;
  score?: number;
}

export interface Suggestion {
  product: Product;
  reason: string;
  score: number;
}

export interface AiAction {
  type: 'add_item' | 'open_table' | 'goto_table' | 'search';
  label: string;
  table_number?: number;
  order_id?: number;
  product_id?: number;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  term?: string;
}

export interface AiReply {
  answer: string;
  actions: AiAction[];
  provider: string;
  mode: 'local' | 'remoto';
  note?: string;
  suggestions: string[];
}

export interface TableDetail {
  table: { id: number; number: number; status: string; seats: number; zone: string };
  order: Order | null;
  next_order_number: number;
  suggestions: Suggestion[];
}

export interface Overview {
  restaurant_name: string;
  service_fee_percent: number;
  today: { revenue: number; service_fees: number; discounts: number; orders: number; items: number; people: number; avg_ticket: number };
  open: { tables: number; total: number; items: number };
  yesterday_revenue: number;
  week_revenue: number;
  month_revenue: number;
  top_today: Array<{ name: string; qty: number; revenue: number }>;
  top_week: Array<{ name: string; qty: number; revenue: number }>;
  series: Array<{ day: string; revenue: number; orders: number }>;
  hours: Array<{ hour: number; orders: number; revenue: number }>;
}

const TOKEN_KEY = 'espetaria.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    tokenStore.clear();
    onUnauthorized?.();
    throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const details = Array.isArray(data?.details) ? ` (${data.details.join('; ')})` : '';
    throw new ApiError(res.status, `${data?.error ?? 'Erro inesperado.'}${details}`);
  }
  return data as T;
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const patch = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
const put = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
const del = <T,>(path: string) => request<T>(path, { method: 'DELETE' });

export const api = {
  /* autenticação */
  login: (username: string, password: string) => post<{ token: string; user: User }>('/auth/login', { username, password }),
  me: () => get<{ user: User }>('/auth/me'),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  changePassword: (current_password: string, new_password: string) =>
    post<{ ok: boolean }>('/auth/change-password', { current_password, new_password }),
  users: () => get<{ users: any[] }>('/auth/users'),
  createUser: (body: { name: string; username: string; role: 'admin' | 'waiter'; password: string }) =>
    post<{ user: any }>('/auth/users', body),
  updateUser: (id: number, body: Record<string, unknown>) => patch<{ user: any }>(`/auth/users/${id}`, body),
  deleteUser: (id: number) => del<{ ok: boolean; deleted?: boolean; deactivated?: boolean }>(`/auth/users/${id}`),

  /* salão */
  tables: () => get<{ tables: TableSummary[]; overview: Overview }>('/tables'),
  table: (id: number) => get<TableDetail>(`/tables/${id}`),
  openTable: (id: number, people = 1) => post<TableDetail & { order_id: number }>(`/tables/${id}/open`, { people }),
  closeTable: (
    id: number,
    body: { method: string; discount?: number; service_fee_percent?: number; service_fee?: number; people_count?: number; notes?: string },
  ) => post<TableDetail & { receipt: { total: number; subtotal: number; service_fee: number; discount: number; method: string; table_number: number } }>(`/tables/${id}/close`, body),
  cancelTable: (id: number, reason?: string) => post<TableDetail>(`/tables/${id}/cancel`, { reason }),
  transferTable: (id: number, to_number: number) => post<TableDetail>(`/tables/${id}/transfer`, { to_number }),
  updateTable: (id: number, body: { seats?: number; zone?: string }) => patch<TableDetail>(`/tables/${id}`, body),
  bill: (id: number) => get<{ bill: string; order: Order }>(`/tables/${id}/bill`),

  /* comanda */
  order: (id: number) => get<{ order: Order; suggestions: Suggestion[] }>(`/orders/${id}`),
  updateOrder: (id: number, body: { discount?: number; service_fee?: number; people_count?: number; notes?: string }) =>
    patch<{ order: Order }>(`/orders/${id}`, body),
  addItem: (body: { order_id?: number; table_id?: number; product_id: number; quantity?: number; command_name?: string; notes?: string }) =>
    post<{ item_id: number; order_id: number; order: Order; suggestions: Suggestion[] }>('/orders/items', body),
  cancelItem: (id: number, reason?: string) => post<{ order: Order }>(`/items/${id}/cancel`, { reason }),
  restoreItem: (id: number) => post<{ order: Order }>(`/items/${id}/restore`),
  updateItem: (id: number, body: { quantity?: number; notes?: string | null }) => patch<{ order: Order }>(`/items/${id}`, body),
  deleteItem: (id: number) => del<{ order: Order }>(`/items/${id}`),

  /* cardápio */
  products: (params: { q?: string; category?: string; all?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.category) search.set('category', params.category);
    if (params.all) search.set('all', 'true');
    const qs = search.toString();
    return get<{ products: Product[] }>(`/products${qs ? `?${qs}` : ''}`);
  },
  searchProducts: (q: string, limit = 8) => get<{ results: Product[] }>(`/products/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  categories: () => get<{ categories: Array<{ category: string; total: number }> }>('/products/categories'),
  createProduct: (body: Record<string, unknown>) => post<{ product: Product }>('/products', body),
  updateProduct: (id: number, body: Record<string, unknown>) => patch<{ product: Product }>(`/products/${id}`, body),
  deleteProduct: (id: number) => del<{ ok: boolean; deleted: boolean; deactivated: boolean }>(`/products/${id}`),

  /* IA */
  aiChat: (message: string, table_id?: number) => post<AiReply>('/ai/chat', { message, table_id }),
  aiSearch: (q: string, limit = 8) => get<{ results: Product[]; provider: string; understood: string | null }>(`/ai/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  aiSuggest: (params: { order_id?: number; table_id?: number; limit?: number; hint?: string }) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && search.set(k, String(v)));
    return get<{ suggestions: Suggestion[]; based_on: string[]; provider: string }>(`/ai/suggest?${search}`);
  },
  aiSummary: () => get<{ headline: string; bullets: string[]; provider: string; mode: string }>('/ai/summary'),
  aiHistory: (limit = 60) => get<{ history: Array<{ id: number; role: string; content: string; provider: string; created_at: string }> }>(`/ai/history?limit=${limit}`),
  clearAiHistory: () => del<{ ok: boolean; removed: number }>('/ai/history'),
  aiSettings: () => get<{ settings: any }>('/ai/settings'),
  saveAiSettings: (body: Record<string, unknown>) => put<{ settings: any }>('/ai/settings', body),
  testAi: (body: Record<string, unknown>) => post<{ ok: boolean; message: string }>('/ai/test', body),
  aiStatus: () => get<{ provider: string; mode: string; enabled: boolean }>('/ai/overview'),

  insights: () => get<Overview>('/insights'),

  /* admin */
  adminOverview: () => get<any>('/admin/overview'),
  activity: (limit = 80) => get<{ activity: any[] }>(`/admin/activity?limit=${limit}`),
  cleanupPreview: () => get<{ preview: any }>('/admin/cleanup/preview'),
  cleanup: (action: string, params: Record<string, unknown> = {}) =>
    post<{ result: { label: string; message: string; affected: number }; preview: any }>('/admin/cleanup', { action, ...params }),
  reports: (days = 7) => get<any>(`/admin/reports/sales?days=${days}`),
  backupUrl: () => `/api/admin/backup`,
};
