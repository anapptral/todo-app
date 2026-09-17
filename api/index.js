// Vercel serverless entry point. On serverless platforms nothing calls
// app.listen(); the platform invokes this handler per request instead.
// Local development still uses `npm start` (src/server.js).
import { createApp } from '../src/app.js';

let app;
try {
  app = createApp();
} catch (err) {
  // Fail loudly in the function logs instead of returning a bare 500.
  console.error('Failed to initialize app:', err);
  throw err;
}

export default async function handler(req, res) {
  return app(req, res);
}
