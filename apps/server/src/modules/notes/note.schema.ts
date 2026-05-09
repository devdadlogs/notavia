import { z } from 'zod';

export const createNoteSchema = z.object({
  title: z.string().optional().default('Untitled'),
  notebookId: z.string().uuid().optional().nullable(),
  contentJson: z.any().optional(),
  contentText: z.string().optional()
});

export const updateNoteSchema = createNoteSchema.partial().extend({
  isPinned: z.boolean().optional(),
  isTrashed: z.boolean().optional(),
  wordCount: z.number().optional(),
  version: z.number().optional(),
  coverImage: z.string().nullable().optional(),
  icon: z.string().nullable().optional()
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
