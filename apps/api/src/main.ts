import 'reflect-metadata';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { disconnectDatabase } from '@my-erp/db';
import { AppModule } from './app.module';

// Load the monorepo-root .env regardless of cwd. Both src (tsx) and dist (node)
// sit three levels under the repo root, so __dirname/../../.. resolves to root.
// dotenv never overrides vars already set by the environment (prod/CI safe).
config({ path: resolve(__dirname, '../../..', '.env') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  const port = Number(process.env.PORT ?? 8000);
  await app.listen(port);
  console.log(`[api] my-erp api listening on http://localhost:${port} (health: /health)`);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrap();
