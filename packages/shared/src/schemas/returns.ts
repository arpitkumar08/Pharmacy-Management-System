import { z } from 'zod';
import { ReturnDisposition, ReturnReasonCode } from '../enums';

export const createReturnItemSchema = z.object({
  allocationId: z.string().uuid('Valid allocation reference is required'),
  qty: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be an integer')
    .positive('Quantity returned must be greater than zero'),
  disposition: z.nativeEnum(ReturnDisposition, {
    errorMap: () => ({
      message: 'Please select a valid disposition (RESTOCK, QUARANTINE, WRITE_OFF)',
    }),
  }),
});

export type CreateReturnItemInput = z.infer<typeof createReturnItemSchema>;

export const createReturnSchema = z.object({
  saleId: z.string().uuid('Valid sale reference is required'),
  reasonCode: z.nativeEnum(ReturnReasonCode, {
    errorMap: () => ({ message: 'Please select a return reason code' }),
  }),
  reasonNote: z
    .string()
    .min(5, 'Reason note is mandatory and must be at least 5 characters')
    .max(500, 'Reason note cannot exceed 500 characters'),
  items: z.array(createReturnItemSchema).min(1, 'At least one item must be returned'),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
