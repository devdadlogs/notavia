import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

export interface PrismaPluginOptions {
  // Add any options here if needed
}

export default fp<PrismaPluginOptions>(async (fastify, opts) => {
  const prisma = new PrismaClient();

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (server) => {
    await server.prisma.$disconnect();
  });
});

declare module 'fastify' {
  export interface FastifyInstance {
    prisma: PrismaClient;
  }
}
