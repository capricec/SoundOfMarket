import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { fetchQuotes, fetchSnapshot, type SnapshotQuery } from "./server/twelve";

function marketApi(key: string | undefined): Plugin {
  return {
    name: "market-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/snapshot") && !url.startsWith("/api/quotes")) return next();
        if (!key) {
          res.statusCode = 503;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Add TWELVE_DATA_API_KEY to a .env file and restart." }));
          return;
        }
        try {
          if (url.startsWith("/api/quotes")) {
            const quotes = await fetchQuotes(key);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ quotes }));
            return;
          }
          const params = new URL(url, "http://localhost").searchParams;
          const read = (name: string, fallback: string) => params.get(name) ?? fallback;
          const query: SnapshotQuery = {
            spy: read("spy", "sma:30"),
            tlt: read("tlt", "sma:30"),
            gld: read("gld", "sma:50"),
            vix: read("vix", "sma:20"),
          };
          const body = await fetchSnapshot(key, query);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Market request failed" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), marketApi(env.TWELVE_DATA_API_KEY)],
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
