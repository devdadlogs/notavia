import { PrismaClient } from '@prisma/client';
import { CreateNotebookInput, UpdateNotebookInput } from './notebook.schema';

export class NotebookService {
  constructor(private prisma: PrismaClient) {}

  async create(userId: string, data: CreateNotebookInput) {
    return this.prisma.notebook.create({
      data: {
        userId,
        ...data
      }
    });
  }

  async getAllForUser(userId: string) {
    return this.prisma.notebook.findMany({
      where: { userId },
      orderBy: { order: 'asc' }
    });
  }

  async update(id: string, userId: string, data: UpdateNotebookInput) {
    // Ensure ownership
    const notebook = await this.prisma.notebook.findFirst({
      where: { id, userId }
    });

    if (!notebook) {
      throw new Error('Notebook not found');
    }

    return this.prisma.notebook.update({
      where: { id },
      data
    });
  }

  async delete(id: string, userId: string) {
    const notebook = await this.prisma.notebook.findFirst({
      where: { id, userId }
    });

    if (!notebook) {
      throw new Error('Notebook not found');
    }

    return this.prisma.notebook.delete({
      where: { id }
    });
  }
}
