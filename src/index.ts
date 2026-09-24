import { TypoSpotterApp } from "./app";
import { RUN_PAGE } from "./config";

async function boot(): Promise<void> {
  if (mw.config.get("wgPageName") !== RUN_PAGE || mw.config.get("wgAction") !== "view") {
    return;
  }

  await Promise.resolve(mw.loader.using(["mediawiki.api", "mediawiki.util"]));
  const content = document.querySelector<HTMLElement>("#content");

  if (!content) {
    mw.notify?.("TypoSpotter could not find the page content area.", { type: "error" });
    return;
  }

  document.body.classList.add("ts-active");
  const app = new TypoSpotterApp(content);
  await app.start();
}

void boot().catch((error) => {
  console.error("TypoSpotter failed to start", error);
  mw.notify?.("TypoSpotter failed to start. Check the browser console for details.", { type: "error" });
});
