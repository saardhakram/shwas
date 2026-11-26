/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite dev middleware for server-side /api/* routes
function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url?.startsWith('/api/plan')) {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                // Load server-side handler via Vite's SSR module loader
                const { processPlanRequest } = await server.ssrLoadModule('/api/plan.ts');
                const parsedBody = body ? JSON.parse(body) : {};
                const env = loadEnv('development', process.cwd(), '');
                const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
                if (env.GEMINI_MODEL) {
                  process.env.GEMINI_MODEL = env.GEMINI_MODEL;
                }
                if (env.GEMINI_FALLBACK_MODEL) {
                  process.env.GEMINI_FALLBACK_MODEL = env.GEMINI_FALLBACK_MODEL;
                }
                if (env.GEMINI_FALLBACK_MODEL) {
                  process.env.GEMINI_FALLBACK_MODEL = env.GEMINI_FALLBACK_MODEL;
                }

                const result = await processPlanRequest(parsedBody, apiKey);
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify(result));
              } catch (err: any) {
                console.error('[API Dev Server Error]:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
        }

        if (req.url?.startsWith('/api/scan')) {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                const { processScanRequest } = await server.ssrLoadModule('/api/scan.ts');
                const parsedBody = body ? JSON.parse(body) : {};
                const env = loadEnv('development', process.cwd(), '');
                const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
                if (env.GEMINI_MODEL) {
                  process.env.GEMINI_MODEL = env.GEMINI_MODEL;
                }
                if (env.GEMINI_FALLBACK_MODEL) {
                  process.env.GEMINI_FALLBACK_MODEL = env.GEMINI_FALLBACK_MODEL;
                }
                if (env.GEMINI_FALLBACK_MODEL) {
                  process.env.GEMINI_FALLBACK_MODEL = env.GEMINI_FALLBACK_MODEL;
                }

                const result = await processScanRequest(parsedBody, apiKey);
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify(result));
              } catch (err: any) {
                console.error('[API Dev Server Scan Error]:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
