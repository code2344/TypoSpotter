import { readFile } from "node:fs/promises";

const API_URL = "https://en.wikipedia.org/w/api.php";
const TARGET_TITLE = "User:SuperCode111/TypoSpotter/ts.js";
const USER_AGENT = "TypoSpotter deployer/0.2 (https://github.com/code2344/TypoSpotter)";
const username = process.env.WIKIPEDIA_BOT_USERNAME;
const password = process.env.WIKIPEDIA_BOT_PASSWORD;
const commitSha = process.env.GITHUB_SHA || "local";

if (!username || !password) {
  throw new Error("WIKIPEDIA_BOT_USERNAME and WIKIPEDIA_BOT_PASSWORD are required.");
}

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const bundle = await readFile(new URL("../dist/TypoSpotter.user.js", import.meta.url), "utf8");
const cookies = new Map();

function retainCookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);

  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function api(parameters, method = "GET") {
  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, String(value)])),
    format: "json",
    formatversion: "2"
  });
  const headers = {
    Accept: "application/json",
    "User-Agent": USER_AGENT
  };
  if (cookies.size > 0) headers.Cookie = cookieHeader();

  const response = await fetch(method === "GET" ? `${API_URL}?${body}` : API_URL, {
    method,
    headers: method === "POST"
      ? { ...headers, "Content-Type": "application/x-www-form-urlencoded" }
      : headers,
    body: method === "POST" ? body : undefined,
    redirect: "error"
  });
  retainCookies(response);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Wikipedia API HTTP ${response.status}.`);
  }
  if (data.error) {
    throw new Error(`Wikipedia API ${data.error.code}: ${data.error.info}`);
  }
  return data;
}

const loginTokenResponse = await api({ action: "query", meta: "tokens", type: "login" });
const loginToken = loginTokenResponse.query?.tokens?.logintoken;
if (!loginToken) throw new Error("Wikipedia did not provide a login token.");

const loginResponse = await api({
  action: "login",
  lgname: username,
  lgpassword: password,
  lgtoken: loginToken
}, "POST");

if (loginResponse.login?.result !== "Success") {
  throw new Error(`Wikipedia login failed: ${loginResponse.login?.reason || loginResponse.login?.result || "unknown error"}`);
}

const state = await api({
  action: "query",
  assert: "user",
  meta: "tokens",
  type: "csrf",
  prop: "revisions",
  titles: TARGET_TITLE,
  rvprop: "ids|timestamp|content",
  rvslots: "main",
  curtimestamp: "1"
});

const page = state.query?.pages?.[0];
const revision = page?.revisions?.[0];
const currentText = revision?.slots?.main?.content;
const csrfToken = state.query?.tokens?.csrftoken;

if (!page || page.missing || !revision || typeof currentText !== "string") {
  throw new Error(`${TARGET_TITLE} must already exist before automated deployment.`);
}
if (!csrfToken) throw new Error("Wikipedia did not provide a CSRF token.");

if (currentText === bundle) {
  console.log(`${TARGET_TITLE} already contains TypoSpotter v${packageJson.version}; no edit needed.`);
  process.exit(0);
}

const editResponse = await api({
  action: "edit",
  assert: "user",
  title: TARGET_TITLE,
  text: bundle,
  token: csrfToken,
  summary: `Deploy TypoSpotter v${packageJson.version} from GitHub (${commitSha.slice(0, 7)})`,
  baserevid: revision.revid,
  basetimestamp: revision.timestamp,
  starttimestamp: state.curtimestamp,
  nocreate: "1",
  watchlist: "nochange",
  maxlag: "5"
}, "POST");

if (editResponse.edit?.result !== "Success" || !editResponse.edit?.newrevid) {
  throw new Error("Wikipedia did not confirm the deployment edit.");
}

console.log(`Deployed TypoSpotter v${packageJson.version} to ${TARGET_TITLE} as revision ${editResponse.edit.newrevid}.`);
