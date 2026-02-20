import { z } from 'zod';

export const pingSchema = z.object({
    message: z.string().min(1)
    // Generic check for a query or body if needed
});