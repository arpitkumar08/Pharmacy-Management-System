import { z } from 'zod';
import { PaymentMethod } from '../enums';

export const createSaleItemSchema = z.object({
  medicineId: z.string().uuid('Please select a valid medicine'),
  qty: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be an integer')
    .positive('Quantity must be greater than zero'),
});

export type CreateSaleItemInput = z.infer<typeof createSaleItemSchema>;

export const createSaleSchema = z.object({
  branchId: z.string().uuid('Branch is required'),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(100).optional().nullable(),
  customerPhone: z.string().max(20).optional().nullable(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  idempotencyKey: z.string().uuid('A valid idempotency key is required'),
  items: z
    .array(createSaleItemSchema)
    .min(1, 'Sale must contain at least one item')
    .refine((items) => {
      const ids = items.map((i) => i.medicineId);
      return new Set(ids).size === ids.length;
    }, 'Duplicate medicines in cart are not allowed (please merge quantities)'),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
