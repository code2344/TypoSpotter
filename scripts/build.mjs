import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await mkdir(new URL("../dist", import.meta.url), { recursive: true });

await build({
  entryPoints: [new URL("../src/index.ts", import.meta.url).pathname],
  bundle: true,
  minify: false,
  format: "iife",
  target: ["es2020"],
  outfile: new URL("../dist/TypoSpotter.user.js", import.meta.url).pathname,
  banner: {
    js: `// <nowiki>\n// TypoSpotter v${packageJson.version}\n// Source: https://github.com/code2344/TypoSpotter`
  },
  footer: { js: "// </nowiki>" },
  define: {
    __TYPOSPOTTER_VERSION__: JSON.stringify(packageJson.version)
  }
});

const loader = `// TypoSpotter loader\nif (mw.config.get("wgPageName") === "User:SuperCode111/TypoSpotter/run") {\n\tmw.loader.load("/w/index.php?title=User:SuperCode111/TypoSpotter/ts.js&action=raw&ctype=text/javascript");\n}\n`;
await writeFile(new URL("../dist/common-loader.js", import.meta.url), loader);
