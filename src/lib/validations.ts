import { z } from 'zod';

export const reserveSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  warehouseId: z.string().min(1, 'warehouseId is required'),
  quantity: z.number().int().min(1, 'quantity must be at least 1'),
});

export type ReserveInput = z.infer<typeof reserveSchema>;
