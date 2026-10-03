import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const work = join(root, ".work");
const outfile = join(work, "integrations.test.mjs");
await mkdir(work, { recursive: true });
await build({
  entryPoints: [join(root, "tests/integrations.test.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  external: ["node:*"],
  plugins: [{
    name: "cloudflare-workers-test-shim",
    setup(plugin) {
      plugin.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(root, "tests/cloudflare-workers-shim.mjs") }));
    },
  }],
});
try {
  await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
