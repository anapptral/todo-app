// Vercel serverless entry point. Vercel's Express support wants the entry
// module to default-export the app; it manages invocation itself (no listen).
// Re-exporting keeps the app as the default export while letting Vercel treat
// this file as the handler entry.
import app from '../src/app.js';
export default app;
