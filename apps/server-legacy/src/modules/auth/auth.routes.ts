import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema } from './auth.schema';

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const authService = new AuthService(fastify.prisma);

  fastify.post('/register', {
    schema: {
      body: registerSchema
    }
  }, async (request, reply) => {
    try {
      const user = await authService.register(request.body);
      const token = fastify.jwt.sign(user);
      
      reply
        .setCookie('token', token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 // 7 days
        })
        .send({ user, token });
    } catch (error: any) {
      reply.status(400).send({ error: error.message });
    }
  });

  fastify.post('/login', {
    schema: {
      body: loginSchema
    }
  }, async (request, reply) => {
    try {
      const user = await authService.login(request.body);
      const token = fastify.jwt.sign(user);
      
      reply
        .setCookie('token', token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 // 7 days
        })
        .send({ user, token });
    } catch (error: any) {
      reply.status(401).send({ error: error.message });
    }
  });

  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('token').send({ message: 'Logged out successfully' });
  });

  fastify.get('/me', {
    preValidation: [fastify.authenticate]
  }, async (request, reply) => {
    reply.send({ user: request.user });
  });
};

export default authRoutes;
