/// <reference types="vitest" />
import { defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
  });
}

function loadGeminiEnv(): string | undefined {
  const env = loadEnv('development', process.cwd(), '');
  if (env.GEMINI_MODEL) process.env.GEMINI_MODEL = env.GEMINI_MODEL;
  if (env.GEMINI_FALLBACK_MODEL) process.env.GEMINI_FALLBACK_MODEL = env.GEMINI_FALLBACK_MODEL;
  return env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

async function dispatchPostApiRoute(
  server: ViteDevServer,
  url: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const rawBody = await readRequestBody(req);
  const parsedBody: unknown = rawBody ? JSON.parse(rawBody) : {};
  const apiKey = loadGeminiEnv();

  if (url.startsWith('/api/plan')) {
    const mod = (await server.ssrLoadModule('/api/plan.ts')) as {
      processPlanRequest: (body: unknown, key?: string) => Promise<unknown>;
    };
    sendJson(res, 200, await mod.processPlanRequest(parsedBody, apiKey));
    return;
  }

  if (url.startsWith('/api/scan')) {
    const mod = (await server.ssrLoadModule('/api/scan.ts')) as {
      processScanRequest: (body: unknown, key?: string) => Promise<unknown>;
    };
    sendJson(res, 200, await mod.processScanRequest(parsedBody, apiKey));
    return;
  }

  const mod = (await server.ssrLoadModule('/api/ask.ts')) as {
    processAskRequest: (body: unknown, key?: string, clientId?: string) => Promise<unknown>;
  };
  sendJson(
    res,
    200,
    await mod.processAskRequest(parsedBody, apiKey, req.socket?.remoteAddress || 'local'),
  );
}

async function handleApiRoute(
  server: ViteDevServer,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url || '';
  if (url.startsWith('/api/health')) {
    res.setHeader('Cache-Control', 'no-store');
    sendJson(res, 200, { ok: true });
    return true;
  }

  const isSupportedPost =
    req.method === 'POST' &&
    (url.startsWith('/api/plan') || url.startsWith('/api/scan') || url.startsWith('/api/ask'));
  if (!isSupportedPost) return false;

  try {
    await dispatchPostApiRoute(server, url, req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('[API Dev Server Error]:', err);
    sendJson(res, 500, { error: message });
  }
  return true;
}

// Vite dev middleware for server-side /api/* routes
function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          void handleApiRoute(server, req, res).then((handled) => {
            if (!handled) next();
          });
        },
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
  server: {
    port: 5180,
    host: true,
  },
});
