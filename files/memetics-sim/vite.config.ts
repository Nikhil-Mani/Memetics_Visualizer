import { createInterpreter } from './server/interpret';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const handler = createInterpreter({
    baseUrl: env.SEMANTIC_BASE_URL,
    model: env.SEMANTIC_MODEL,
    apiKey: env.SEMANTIC_API_KEY,
  });
  return {
    plugins: [
      react(),
      {
        name: 'semantic-api',
        configureServer(server) { server.middlewares.use('/api/interpret', handler); },
        configurePreviewServer(server) { server.middlewares.use('/api/interpret', handler); },
      },
    ],
    build: { target: 'es2020', outDir: 'dist' },
  };
});
