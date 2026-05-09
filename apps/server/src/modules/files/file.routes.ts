import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { FileService } from './file.service';

const fileRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const fileService = new FileService();

  fastify.addHook('preValidation', fastify.authenticate);

  fastify.post('/upload', async (request, reply) => {
    const data = await request.file({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      }
    });

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    try {
      const buffer = await data.toBuffer();
      const url = await fileService.uploadFile(buffer, data.filename, data.mimetype);
      
      return { url };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to upload file' });
    }
  });
};

export default fileRoutes;
