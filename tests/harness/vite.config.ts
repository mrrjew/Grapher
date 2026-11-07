import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const harnessRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(harnessRoot, "../..");

// Isolated component test host. This is never a route in the Next.js app.
export default defineConfig({
  root: harnessRoot,
  resolve: { alias: { "@": path.join(projectRoot, "src") } },
  oxc: { jsx: { runtime: "automatic" } },
  server: {
    host: "127.0.0.1",
    port: 3001,
    strictPort: true,
    fs: { allow: [projectRoot] },
  },
});
