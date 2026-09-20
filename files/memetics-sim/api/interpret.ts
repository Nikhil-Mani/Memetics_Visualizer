import { createInterpreter } from '../server/interpret';

// Vercel runs this module as a Node serverless function. The shared handler
// keeps local Vite and hosted behavior identical while credentials remain
// server-side environment variables.
const handler = createInterpreter({
  baseUrl: process.env.SEMANTIC_BASE_URL,
  model: process.env.SEMANTIC_MODEL,
  apiKey: process.env.SEMANTIC_API_KEY,
});

export default function interpret(req: unknown, res: unknown) {
  return handler(req as never, res as never);
}
