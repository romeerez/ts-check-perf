const { build } = require("esbuild");

build({
  entryPoints: ["src/main.ts", "src/patchTypeScript.ts"],
  sourcemap: true,
  platform: "node",
  format: "cjs",
  outdir: "dist",
});
