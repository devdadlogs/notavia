import { PrismaClient } from '@prisma/client';
import { CreateNoteInput, UpdateNoteInput } from './note.schema';

export class NoteService {
  constructor(private prisma: PrismaClient) {}

  async create(userId: string, data: CreateNoteInput) {
    return this.prisma.note.create({
      data: {
        userId,
        ...data
      }
    });
  }

  async getAllForUser(userId: string, notebookId?: string) {
    return this.prisma.note.findMany({
      where: { 
        userId, 
        isTrashed: false,
        ...(notebookId ? { notebookId } : {})
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getById(id: string, userId: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, userId }
    });
    
    if (!note) {
      throw new Error('Note not found');
    }
    
    return note;
  }

  async update(id: string, userId: string, data: UpdateNoteInput) {
    const note = await this.prisma.note.findFirst({
      where: { id, userId }
    });

    if (!note) {
      throw new Error('Note not found');
    }

    return this.prisma.note.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 } // Auto-increment version
      }
    });
  }

  async trash(id: string, userId: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, userId }
    });

    if (!note) {
      throw new Error('Note not found');
    }

    return this.prisma.note.update({
      where: { id },
      data: { isTrashed: true }
    });
  }
}
