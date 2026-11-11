import type {
  ApiErrorResponse, DashboardStats, BatchSummary, MedicineSummary, SaleSummary,
  UserSummary, StockMovementSummary, StockAdjustmentSummary,
  ReconciliationReportResponse, AuditLogSummary, CategorySummary, CreateSaleInput,
  CreateAdjustmentInput, CreateReturnInput, CreateMedicineInput, BranchSummary,
  PurchaseOrderSummary,
} from '@pharmacy/shared';
import { UserRole } from '@pharmacy/shared';

export class ApiError extends Error {
  status: number;
  code: string;
  detail: string;
  errors?: Array<{ field: string; message: string }>;
  requestId?: string;
  constructor(data: ApiErrorResponse) {
    super(data.detail || data.title || 'An API error occurred');
    this.name = 'ApiError'; this.status = data.status; this.code = data.code;
    this.detail = data.detail; this.errors = data.errors; this.requestId = data.requestId;
  }
}

let refreshInFlight: Promise<boolean> | null = null;
function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(response => response.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function request<T>(endpoint: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (typeof window !== 'undefined') {
    try {
      const noBranchContext = endpoint.startsWith('/auth/') || endpoint === '/branches';
      const branch = noBranchContext ? null : JSON.parse(localStorage.getItem('pharmacore_branch') || 'null');
      if (branch?.id) headers.set('X-Branch-Id', branch.id);
    } catch {}
  }
  const response = await fetch(`/api/v1${endpoint}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    if (response.status === 401 && retry && !endpoint.startsWith('/auth/')) {
      if (await refreshAccessToken()) return request<T>(endpoint, options, false);
    }
    const data = await response.json().catch(() => null);
    throw new ApiError(data || { title: 'Request failed', status: response.status, code: 'HTTP_ERROR', detail: response.statusText });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
const body = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) });

export const apiClient = {
  login: (credentials: { email: string; password: string }) => request<{ user: UserSummary; tokens: { accessToken: string; refreshToken: string } }>('/auth/login', body(credentials)),
  getMe: () => request<UserSummary>('/auth/me'),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  refresh: () => request('/auth/refresh', { method: 'POST' }),
  getBranches: () => request<BranchSummary[]>('/branches'),
  getUsers: () => request<UserSummary[]>('/users'),
  createUser: (data: { email: string; name: string; password: string; branchRoles: Array<{ branchId: string; role: UserRole }> }) => request<UserSummary>('/users', body(data)),
  updateUser: (id: string, data: { name?: string; isActive?: boolean }) => request<UserSummary>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateUserRoles: (id: string, branchRoles: Array<{ branchId: string; role: UserRole }>) => request<UserSummary>(`/users/${id}/branch-roles`, { method: 'PUT', body: JSON.stringify({ branchRoles }) }),
  createBranch: (data: { name: string; code: string; timezone?: string }) => request<BranchSummary>('/branches', body(data)),
  getOrganizationSettings: () => request<{ id: string; name: string; settings: Record<string, unknown> }>('/org/settings'),
  updateOrganizationSettings: (settings: Record<string, unknown>) => request('/org/settings', { method: 'PATCH', body: JSON.stringify({ settings }) }),
  getDashboardStats: (branchId?: string) => request<DashboardStats>(`/reports/dashboard${branchId ? `?branchId=${branchId}` : ''}`),
  getMedicines: () => request<MedicineSummary[]>('/medicines'),
  getCategories: () => request<CategorySummary[]>('/categories'),
  createMedicine: (data: CreateMedicineInput) => request<MedicineSummary>('/medicines', body(data)),
  getBatches: (filter?: string) => request<BatchSummary[]>(filter ? `/batches?filter=${encodeURIComponent(filter)}` : '/batches'),
  getStockMovements: () => request<StockMovementSummary[]>('/stock-movements'),
  createAdjustment: (data: CreateAdjustmentInput) => request<StockAdjustmentSummary>('/stock-adjustments', body(data)),
  createSale: (data: CreateSaleInput) => request<SaleSummary>('/sales', { ...body(data), headers: { 'Idempotency-Key': data.idempotencyKey } }),
  getSales: () => request<SaleSummary[]>('/sales'),
  getSale: (id: string) => request<SaleSummary>(`/sales/${encodeURIComponent(id)}`),
  createReturn: (data: CreateReturnInput) => request<unknown>('/returns', body(data)),
  getPurchaseOrders: () => request<PurchaseOrderSummary[]>('/purchase-orders'),
  getSuppliers: () => request<Array<{ id: string; name: string }>>('/suppliers'),
  createPurchaseOrder: (data: unknown) => request<PurchaseOrderSummary>('/purchase-orders', body(data)),
  createGoodsReceipt: (data: unknown) => request<PurchaseOrderSummary>('/goods-receipts', body(data)),
  createOrder: (id: string) => request(`/purchase-orders/${id}/order`, body({})),
  receivePurchase: (id: string, data: unknown) => request(`/purchase-orders/${id}/receive`, body(data)),
  getReconciliationReport: (branchId: string, from?: string, to?: string) => request<ReconciliationReportResponse>(`/reports/reconciliation?branchId=${encodeURIComponent(branchId)}&from=${from || ''}&to=${to || ''}`),
  getAuditLogs: async () => {
    const result = await request<{ items: AuditLogSummary[] }>('/audit-logs');
    return result.items;
  },
};
