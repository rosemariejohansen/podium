import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ENV, type Env } from '../../src/config/env.js';

export async function createTestApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<NestExpressApplication> {
  const moduleRef = await override(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, app.get<Env>(ENV));
  await app.init();
  return app;
}
