import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import envPlugin from './config/env';
import dbPlugin from './plugins/db';
import authPlugin from './plugins/auth';
import authRoutes from './modules/auth/auth.routes';
import notebookRoutes from './modules/notebooks/notebook.routes';
import noteRoutes from './modules/notes/note.routes';
import fileRoutes from './modules/files/file.routes';
import fastifyMultipart from '@fastify/multipart';

export const buildApp = async () => {
  const app = Fastify({
    logger: true
  }).withTypeProvider<ZodTypeProvider>();

  // Add Zod compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register core plugins
  await app.register(envPlugin);
  await app.register(fastifyMultipart);
  
  // Register CORS
  await app.register(cors, {
    origin: true, // Config this later for production
    credentials: true
  });

  // Register DB and Auth plugins
  await app.register(dbPlugin);
  await app.register(authPlugin);

  // Register Routes
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(notebookRoutes, { prefix: '/api/notebooks' });
  app.register(noteRoutes, { prefix: '/api/notes' });
  app.register(fileRoutes, { prefix: '/api/files' });

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
};
