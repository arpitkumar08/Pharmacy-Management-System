import {
  UserRole,
  BatchStatus,
  PurchaseOrderStatus,
  SaleStatus,
  MovementType,
  AdjustmentReasonCode,
  ReturnReasonCode,
  ReturnDisposition,
  PaymentMethod,
  MedicineUnit,
} from '../enums';

export interface UserSummary {
  id: string;
  email: string;
  name?: string;
  organizationId: string;
  organizationName?: string;
  isActive: boolean;
  branchRoles: Array<{
    branchId: string;
    branchName?: string;
    role: UserRole;
  }>;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  settings?: {
    taxRateDefault?: number;
    nearExpiryDays?: number;
    returnWindowDays?: number;
    minShelfLifeDays?: number;
  };
}

export interface BranchSummary {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  timezone: string;
}

export interface CategorySummary {
  id: string;
  organizationId: string;
  name: string;
  medicineCount?: number;
}

export interface SupplierSummary {
  id: string;
  organizationId: string;
  name: string;
  contact?: string | null;
  isActive: boolean;
}

export interface MedicineSummary {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  genericName?: string | null;
  categoryId: string;
  categoryName?: string;
  unit: MedicineUnit | string;
  taxRate: number;
  requiresPrescription: boolean;
  reorderLevel: number;
  isActive: boolean;
  totalStock?: number;
  activeBatchCount?: number;
}

export interface BatchSummary {
  id: string;
  organizationId: string;
  branchId: string;
  branchName?: string;
  medicineId: string;
  medicineName?: string;
  medicineSku?: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  qtyOnHand: number;
  purchasePrice: number;
  salePrice: number;
  status: BatchStatus;
  receivedAt: string;
  isExpired?: boolean;
  isNearExpiry?: boolean;
  isLowStock?: boolean;
}

export interface StockMovementSummary {
  id: string;
  organizationId: string;
  branchId: string;
  batchId: string;
  medicineId: string;
  medicineName?: string;
  batchNumber?: string;
  type: MovementType;
  qtyDelta: number;
  balanceAfter: number;
  refType?: string | null;
  refId?: string | null;
  createdBy?: string;
  createdAt: string;
}

export interface SaleItemAllocationSummary {
  id: string;
  saleItemId: string;
  batchId: string;
  batchNumber?: string;
  expiryDate?: string;
  qty: number;
  unitCost: number;
}

export interface SaleItemSummary {
  id: string;
  saleId: string;
  medicineId: string;
  medicineName?: string;
  medicineSku?: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  allocations?: SaleItemAllocationSummary[];
}

export interface SaleSummary {
  id: string;
  branchId: string;
  branchName?: string;
  invoiceNumber: string;
  status: SaleStatus;
  cashierId: string;
  cashierName?: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  idempotencyKey?: string;
  createdAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
  items?: SaleItemSummary[];
}

export interface StockAdjustmentSummary {
  id: string;
  batchId: string;
  batchNumber?: string;
  medicineName?: string;
  qtyDelta: number;
  reasonCode: AdjustmentReasonCode;
  reasonNote: string;
  createdBy: string;
  createdAt: string;
}

export interface SaleReturnSummary {
  id: string;
  saleId: string;
  invoiceNumber?: string;
  branchId: string;
  reasonCode: ReturnReasonCode;
  reasonNote: string;
  refundTotal?: number;
  createdBy: string;
  createdAt: string;
  items: Array<{
    id: string;
    returnId: string;
    allocationId: string;
    qty: number;
    disposition: ReturnDisposition;
    medicineName?: string;
    batchNumber?: string;
  }>;
}

export interface PurchaseOrderItemSummary {
  id: string;
  poId: string;
  medicineId: string;
  medicineName?: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
}

export interface PurchaseOrderSummary {
  id: string;
  branchId: string;
  supplierId: string;
  supplierName?: string;
  status: PurchaseOrderStatus;
  version: number;
  totalAmount: number;
  itemsCount?: number;
  createdAt: string;
  items?: PurchaseOrderItemSummary[];
}

export interface AuditLogSummary {
  id: string;
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string | null;
  ip?: string | null;
  createdAt: string;
}

export interface DashboardStats {
  todaySalesAmount: number;
  todaySalesCount: number;
  lowStockItemsCount: number;
  nearExpiryBatchesCount: number;
  expiredBatchesCount: number;
  totalActiveMedicines: number;
  recentSales: SaleSummary[];
  alerts: {
    lowStock: Array<{
      medicineId: string;
      medicineName: string;
      sku: string;
      currentStock: number;
      reorderLevel: number;
    }>;
    nearExpiry: Array<{
      batchId: string;
      medicineName: string;
      batchNumber: string;
      expiryDate: string;
      qtyOnHand: number;
      daysRemaining: number;
    }>;
  };
}

export interface ReconciliationReportItem {
  medicineId: string;
  medicineName: string;
  sku: string;
  openingStock: number;
  purchases: number;
  sales: number;
  returns: number;
  adjustments: number;
  calculatedClosing: number;
  actualClosing: number;
  variance: number;
  isReconciled: boolean;
}

export interface ReconciliationReportResponse {
  branchId: string;
  branchName: string;
  periodStart: string;
  periodEnd: string;
  items: ReconciliationReportItem[];
  allReconciled: boolean;
}
