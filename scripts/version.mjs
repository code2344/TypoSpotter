import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const level = process.argv[2];

if (!["patch", "minor", "major"].includes(level)) {
  console.error("Usage: node scripts/version.mjs <patch|minor|major>");
  process.exit(1);
}

const packageUrl = new URL("package.json", root);
const lockUrl = new URL("package-lock.json", root);
const readmeUrl = new URL("README.md", root);
const planUrl = new URL("RESEARCH_AND_IMPLEMENTATION_PLAN.md", root);
const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);

if (!match) {
  throw new Error(`Current version is not valid major.minor.patch: ${packageJson.version}`);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);

if (level === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (level === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const previousVersion = packageJson.version;
const nextVersion = `${major}.${minor}.${patch}`;
packageJson.version = nextVersion;
await writeFile(packageUrl, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockJson = JSON.parse(await readFile(lockUrl, "utf8"));
lockJson.version = nextVersion;
if (lockJson.packages?.[""]) lockJson.packages[""].version = nextVersion;
await writeFile(lockUrl, `${JSON.stringify(lockJson, null, 2)}\n`);

const readme = await readFile(readmeUrl, "utf8");
await writeFile(readmeUrl, readme.replace(/Version \d+\.\d+\.\d+ is/, `Version ${nextVersion} is`));

const plan = await readFile(planUrl, "utf8");
await writeFile(planUrl, plan.replaceAll(`TS v${previousVersion}`, `TS v${nextVersion}`));

console.log(`TypoSpotter ${previousVersion} -> ${nextVersion}`);
console.log("Run npm run check && npm run build before publishing.");
