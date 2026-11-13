import { z } from 'zod';

export const createPoItemSchema = z.object({
  medicineId: z.string().uuid('Valid medicine ID required'),
  qtyOrdered: z.number().int().positive('Quantity must be greater than zero'),
  unitCost: z.number().min(0, 'Unit cost cannot be negative'),
});

export const createPurchaseOrderSchema = z.object({
  branchId: z.string().uuid('Valid branch ID required'),
  supplierId: z.string().uuid('Valid supplier ID required'),
  items: z.array(createPoItemSchema).min(1, 'At least one item is required in purchase order'),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const receiveBatchItemSchema = z.object({
  itemId: z.string().uuid('PO item ID required'),
  medicineId: z.string().uuid('Medicine ID required'),
  batchNumber: z.string().min(2, 'Batch number is required').max(80),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be in YYYY-MM-DD format')
    .refine((dateStr) => {
      const exp = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return exp > today;
    }, 'Expiry date must be in the future (cannot receive already expired batches)'),
  qty: z.number().int().positive('Received quantity must be greater than zero'),
  purchasePrice: z.number().min(0, 'Purchase price cannot be negative'),
  salePrice: z.number().min(0, 'Sale price cannot be negative'),
});

export const receivePurchaseOrderSchema = z.object({
  branchId: z.string().uuid('Branch ID required'),
  items: z.array(receiveBatchItemSchema).min(1, 'At least one batch must be received'),
});

export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;
