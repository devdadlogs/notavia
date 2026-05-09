import { z } from 'zod';

export const createNotebookSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().optional(),
  icon: z.string().optional(),
  color: z.string().optional()
});

export const updateNotebookSchema = createNotebookSchema.partial().extend({
  order: z.number().optional()
});

export type CreateNotebookInput = z.infer<typeof createNotebookSchema>;
export type UpdateNotebookInput = z.infer<typeof updateNotebookSchema>;
