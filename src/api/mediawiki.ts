import type { Candidate, PageSnapshot, SearchBatch, TypoRule } from "../types";

export class TypoSpotterApiError extends Error {
  constructor(
    message: string,
    public readonly code = "unknown",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "TypoSpotterApiError";
  }
}

function normalizeError(error: unknown): TypoSpotterApiError {
  if (error instanceof TypoSpotterApiError) {
    return error;
  }
  if (typeof error === "string") {
    return new TypoSpotterApiError(`Wikipedia returned ${error}.`, error);
  }
  if (Array.isArray(error)) {
    const code = typeof error[0] === "string" ? error[0] : "unknown";
    const details = error[1];
    const message =
      details && typeof details === "object" && "info" in details
        ? String((details as { info: unknown }).info)
        : `Wikipedia returned ${code}.`;
    return new TypoSpotterApiError(message, code, details);
  }
  if (error && typeof error === "object") {
    const value = error as { code?: string; info?: string; message?: string };
    return new TypoSpotterApiError(
      value.info || value.message || "The Wikipedia request failed.",
      value.code || "unknown",
      error
    );
  }
  return new TypoSpotterApiError(String(error || "The Wikipedia request failed."));
}

function quoteForCirrus(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

export class MediaWikiApi {
  private readonly api = new mw.Api();

  async search(rule: TypoRule, continueToken?: number, limit = 8): Promise<SearchBatch> {
    try {
      const response = await this.api.get({
        action: "query",
        list: "search",
        // CirrusSearch's regex engine does not support JavaScript-style word
        // boundaries. Discovery is literal; the local scanner enforces exact
        // whole-word matching against the freshly fetched revision.
        srsearch: `${rule.find} insource:"${quoteForCirrus(rule.find)}"`,
        srnamespace: 0,
        srlimit: limit,
        sroffset: continueToken,
        srprop: "",
        format: "json",
        formatversion: 2,
        maxlag: 5
      });
      const candidates: Candidate[] = (response.query?.search ?? []).map(
        (item: { pageid: number; title: string }) => ({
          pageId: item.pageid,
          title: item.title,
          rule
        })
      );
      return {
        candidates,
        continueToken: response.continue?.sroffset
      };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async loadPage(candidate: Candidate): Promise<PageSnapshot> {
    try {
      const response = await this.api.get({
        action: "query",
        pageids: candidate.pageId,
        prop: "info|revisions",
        rvprop: "ids|timestamp|content|contentmodel",
        rvslots: "main",
        curtimestamp: 1,
        format: "json",
        formatversion: 2,
        maxlag: 5
      });
      const page = response.query?.pages?.[0];
      const revision = page?.revisions?.[0];
      const slot = revision?.slots?.main;
      if (!page || page.missing || !revision || typeof slot?.content !== "string") {
        throw new TypoSpotterApiError("The current page text is unavailable.", "missingcontent");
      }
      return {
        pageId: page.pageid,
        title: page.title,
        revisionId: revision.revid,
        baseTimestamp: revision.timestamp,
        startTimestamp: response.curtimestamp,
        contentModel: slot.contentmodel || "wikitext",
        text: slot.content
      };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async edit(snapshot: PageSnapshot, text: string, summary: string): Promise<number> {
    try {
      const response = await this.api.postWithEditToken({
        action: "edit",
        pageid: snapshot.pageId,
        text,
        summary,
        baserevid: snapshot.revisionId,
        basetimestamp: snapshot.baseTimestamp,
        starttimestamp: snapshot.startTimestamp,
        assert: "user",
        minor: 1,
        watchlist: "preferences",
        maxlag: 5,
        format: "json",
        formatversion: 2
      });
      if (response.edit?.result !== "Success" || !response.edit?.newrevid) {
        throw new TypoSpotterApiError("Wikipedia did not confirm that the edit was saved.", "editfailed", response);
      }
      return response.edit.newrevid;
    } catch (error) {
      throw normalizeError(error);
    }
  }
}
