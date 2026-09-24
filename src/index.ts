import { TypoSpotterApp } from "./app";
import { RUN_PAGE } from "./config";

async function boot(): Promise<void> {
  if (mw.config.get("wgPageName") !== RUN_PAGE || mw.config.get("wgAction") !== "view") {
    return;
  }

  await Promise.resolve(mw.loader.using(["mediawiki.api", "mediawiki.util"]));
  document.body.classList.add("ts-active");
  const host = document.createElement("div");
  host.id = "ts-host";
  document.body.append(host);
  const app = new TypoSpotterApp(host);
  await app.start();
}

void boot().catch((error) => {
  console.error("TypoSpotter failed to start", error);
  mw.notify?.("TypoSpotter failed to start. Check the browser console for details.", { type: "error" });
});
