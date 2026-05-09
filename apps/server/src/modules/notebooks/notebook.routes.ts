import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { NotebookService } from './notebook.service';
import { createNotebookSchema, updateNotebookSchema } from './notebook.schema';
import z from 'zod';

const notebookRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const notebookService = new NotebookService(fastify.prisma);

  // Require authentication for all routes in this plugin
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const notebooks = await notebookService.getAllForUser(request.user.id);
    return notebooks;
  });

  fastify.post('/', {
    schema: { body: createNotebookSchema }
  }, async (request, reply) => {
    const notebook = await notebookService.create(request.user.id, request.body);
    return notebook;
  });

  fastify.put('/:id', {
    schema: { 
      params: z.object({ id: z.string().uuid() }),
      body: updateNotebookSchema 
    }
  }, async (request, reply) => {
    try {
      const notebook = await notebookService.update(request.params.id, request.user.id, request.body);
      return notebook;
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  fastify.delete('/:id', {
    schema: { params: z.object({ id: z.string().uuid() }) }
  }, async (request, reply) => {
    try {
      await notebookService.delete(request.params.id, request.user.id);
      return { success: true };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
};

export default notebookRoutes;
