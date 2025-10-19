import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime";

// Use development configuration when NODE_ENV is not "production"
export const inngest = new Inngest(
  process.env.NODE_ENV === "production"
    ? {
        id: "replit-agent-workflow",
        name: "Replit Agent Workflow System",
      }
    : {
        id: "mastra",
        baseUrl: "http://localhost:3000",
        isDev: true,
        middleware: [realtimeMiddleware()],
      },
);

// Log Inngest configuration for debugging
console.log('🔧 Inngest initialized:', process.env.NODE_ENV === "production" ? 'PRODUCTION' : 'DEVELOPMENT');
