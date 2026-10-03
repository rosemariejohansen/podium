import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV, type Env } from './config/env.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bodyParser: false,
  bufferLogs: true,
});
const env = app.get<Env>(ENV);
configureApp(app, env);
await app.listen(env.PORT);
