import fp from 'fastify-plugin';
import fastifyEnv from '@fastify/env';

const schema = {
  type: 'object',
  required: ['DATABASE_URL', 'JWT_SECRET'],
  properties: {
    DATABASE_URL: {
      type: 'string'
    },
    JWT_SECRET: {
      type: 'string',
      default: 'supersecret_change_me_in_production'
    },
    PORT: {
      type: 'number',
      default: 3001
    }
  }
};

const options = {
  confKey: 'config',
  schema,
  dotenv: true
};

export default fp(async (fastify) => {
  await fastify.register(fastifyEnv, options);
});

declare module 'fastify' {
  export interface FastifyInstance {
    config: {
      DATABASE_URL: string;
      JWT_SECRET: string;
      PORT: number;
    };
  }
}
