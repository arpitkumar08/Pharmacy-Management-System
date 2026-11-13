import { z } from 'zod';
import { MedicineUnit } from '../enums';

export const createMedicineSchema = z.object({
  sku: z.string().min(2, 'SKU must be at least 2 characters').max(50),
  name: z.string().min(2, 'Medicine name is required').max(150),
  genericName: z.string().max(150).optional().nullable(),
  categoryId: z.string().uuid('Please select a valid category'),
  unit: z.nativeEnum(MedicineUnit, {
    errorMap: () => ({ message: 'Please select a valid medicine unit' }),
  }),
  taxRate: z
    .number({ invalid_type_error: 'Tax rate must be a number' })
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%'),
  requiresPrescription: z.boolean().default(false),
  reorderLevel: z
    .number({ invalid_type_error: 'Reorder level must be an integer' })
    .int('Reorder level must be a whole number')
    .min(0, 'Reorder level cannot be negative')
    .default(10),
});

export type CreateMedicineInput = z.infer<typeof createMedicineSchema>;

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(80),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(2, 'Supplier name is required').max(150),
  contact: z.string().max(150).optional().nullable(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
