import 'reflect-metadata';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { disconnectDatabase } from '@my-erp/db';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

// Load the monorepo-root .env regardless of cwd. Both src (tsx) and dist (node)
// sit three levels under the repo root, so __dirname/../../.. resolves to root.
// dotenv never overrides vars already set by the environment (prod/CI safe).
config({ path: resolve(__dirname, '../../..', '.env') });

const DEFAULT_LOG_LEVELS: LogLevel[] =
  process.env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn'];
const VALID_LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

function isLogLevel(value: string): value is LogLevel {
  return (VALID_LOG_LEVELS as string[]).includes(value);
}

function resolveLoggerLevels(): LogLevel[] | false {
  const raw = process.env.API_LOG_LEVEL ?? process.env.LOG_LEVEL;
  if (!raw) {
    return DEFAULT_LOG_LEVELS;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'silent' || normalized === 'none' || normalized === 'false') {
    return false;
  }

  const levels = normalized
    .split(',')
    .map((level) => level.trim())
    .filter(isLogLevel);

  return levels.length > 0 ? levels : DEFAULT_LOG_LEVELS;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true, logger: resolveLoggerLevels() });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.useGlobalFilters(new PrismaExceptionFilter());

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
