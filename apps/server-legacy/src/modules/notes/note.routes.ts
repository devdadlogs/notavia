import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { NoteService } from './note.service';
import { createNoteSchema, updateNoteSchema } from './note.schema';
import z from 'zod';

const noteRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const noteService = new NoteService(fastify.prisma);

  fastify.addHook('preValidation', fastify.authenticate);

  fastify.get('/', {
    schema: { querystring: z.object({ notebookId: z.string().uuid().optional() }) }
  }, async (request, reply) => {
    const notes = await noteService.getAllForUser(request.user.id, request.query.notebookId);
    return notes;
  });

  fastify.get('/:id', {
    schema: { params: z.object({ id: z.string().uuid() }) }
  }, async (request, reply) => {
    try {
      const note = await noteService.getById(request.params.id, request.user.id);
      return note;
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  fastify.post('/', {
    schema: { body: createNoteSchema }
  }, async (request, reply) => {
    const note = await noteService.create(request.user.id, request.body);
    return note;
  });

  fastify.put('/:id', {
    schema: { 
      params: z.object({ id: z.string().uuid() }),
      body: updateNoteSchema 
    }
  }, async (request, reply) => {
    try {
      const note = await noteService.update(request.params.id, request.user.id, request.body);
      return note;
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  fastify.delete('/:id', {
    schema: { params: z.object({ id: z.string().uuid() }) }
  }, async (request, reply) => {
    try {
      await noteService.trash(request.params.id, request.user.id);
      return { success: true };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
};

export default noteRoutes;
