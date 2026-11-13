import { z } from 'zod';
import { AdjustmentReasonCode } from '../enums';

export const createAdjustmentSchema = z.object({
  batchId: z.string().uuid('Please select a valid batch'),
  qtyDelta: z
    .number({ invalid_type_error: 'Quantity delta must be a number' })
    .int('Quantity delta must be a whole number')
    .refine((val) => val !== 0, 'Adjustment quantity cannot be zero (must be + or -)'),
  reasonCode: z.nativeEnum(AdjustmentReasonCode, {
    errorMap: () => ({ message: 'Please select an adjustment reason code' }),
  }),
  reasonNote: z
    .string()
    .min(5, 'Reason note is mandatory and must be at least 5 characters')
    .max(500, 'Reason note cannot exceed 500 characters'),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const batchFilterSchema = z.object({
  medicineId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.string().optional(),
  filter: z.enum(['all', 'low', 'near-expiry', 'expired']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type BatchFilterInput = z.infer<typeof batchFilterSchema>;
