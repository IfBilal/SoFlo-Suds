import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { UrableError } from './urable/client.js';
import { authRoutes } from './routes/auth.js';
import { customerRoutes } from './routes/customer.js';
import { adminRoutes } from './routes/admin.js';

const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'] } });
const corsOrigins = [process.env.ADMIN_ORIGIN, process.env.CORS_ORIGINS]
  .filter((value): value is string => !!value)
  .flatMap(value => value.split(',').map(origin => origin.trim()).filter(Boolean));
await app.register(cors, { origin: corsOrigins.length ? corsOrigins : false });
await app.register(rateLimit, { global: false });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: 'Please check the highlighted fields.', details: error.flatten() } });
  const known = error as Error & { statusCode?: number; code?: string };
  if (known.statusCode && known.statusCode < 500) return reply.code(known.statusCode).send({ error: { code: known.code ?? 'REQUEST_FAILED', message: known.message } });
  if (error instanceof UrableError) return reply.code(503).send({ error: { code: 'URABLE_UNAVAILABLE', message: 'SoFlo Suds services are temporarily unavailable. Please try again.' } });
  app.log.error(error);
  return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
});
app.get('/health', async () => ({ status: 'ok' }));
await app.register(authRoutes);
await app.register(customerRoutes);
await app.register(adminRoutes);
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
app.listen({ port, host: '0.0.0.0' }).catch((error: unknown) => { app.log.error(error); process.exitCode = 1; });
