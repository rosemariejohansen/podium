import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { registerBodyParsers } from './common/http/body-parsers.js';
import { noStoreForPrivateApis } from './common/http/cache-control.js';
import { requestId } from './common/http/request-id.js';
import type { Env } from './config/env.js';

/** Shared by main.ts and every e2e test, so tests exercise the real middleware stack. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUSTED_PROXY_CIDR);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  // Before the body parsers and routes, so 400/401/404/413 error responses carry it too.
  app.use(noStoreForPrivateApis);
  registerBodyParsers(app);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Podium API')
    .setDescription('Game API (/v1, API key) and public read API (/public).')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'apiKey')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'docs-json',
  });
}
