import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn'],
  });
  // Closes BullMQ workers (waiting for the active job) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  new Logger('VideoWorker').log('StreamTube video worker started');
}

bootstrap().catch((err: unknown) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
