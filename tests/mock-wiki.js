const mockPages = [
  { pageid: 101, title: "History of correspondence" },
  { pageid: 102, title: "Municipal government" },
  { pageid: 103, title: "Early printing" },
  { pageid: 104, title: "Public administration" }
];

window.mw = {
  config: {
    get(name) {
      return {
        wgPageName: "User:SuperCode111/TypoSpotter/run",
        wgAction: "view",
        wgUserName: "SuperCode111"
      }[name];
    }
  },
  loader: { using: async () => undefined },
  storage: {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => (localStorage.setItem(key, value), true)
  },
  util: {
    getUrl(title, parameters) {
      const query = parameters ? `?${new URLSearchParams(parameters)}` : "";
      return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}${query}`;
    }
  },
  notify: console.log,
  Api: class {
    async get(params) {
      if (params.list === "search") {
        return { query: { search: mockPages }, continue: { sroffset: 8 } };
      }
      return {
        curtimestamp: "2026-09-24T04:30:00Z",
        query: {
          pages: [{
            pageid: Number(params.pageids),
            title: mockPages.find((page) => page.pageid === Number(params.pageids))?.title || "History of correspondence",
            actions: { edit: true },
            revisions: [{
              revid: 99101,
              timestamp: "2026-09-24T04:20:00Z",
              slots: { main: { contentmodel: "wikitext", content: "The letter was recieve by the council in 1912. It was later archived.\n\n== History ==\nThe office did not recieve another copy until May." } }
            }]
          }]
        }
      };
    }
    async post(params) {
      const proposed = String(params["totext-main"] || "");
      const rows = [];
      if (proposed.includes("The letter was receive")) {
        rows.push('<tr><td class="diff-marker">−</td><td class="diff-deletedline"><div>The letter was <del class="diffchange">recieve</del> by the council in 1912.</div></td><td class="diff-marker">+</td><td class="diff-addedline"><div>The letter was <ins class="diffchange">receive</ins> by the council in 1912.</div></td></tr>');
      }
      if (proposed.includes("did not receive another")) {
        rows.push('<tr><td class="diff-marker">−</td><td class="diff-deletedline"><div>The office did not <del class="diffchange">recieve</del> another copy until May.</div></td><td class="diff-marker">+</td><td class="diff-addedline"><div>The office did not <ins class="diffchange">receive</ins> another copy until May.</div></td></tr>');
      }
      return {
        compare: {
          body: '<tr><td colspan="2" class="diff-lineno">Current revision</td><td colspan="2" class="diff-lineno">Proposed revision</td></tr>' + rows.join("")
        }
      };
    }
    async postWithEditToken() {
      return { edit: { result: "Success", newrevid: 99102 } };
    }
  }
};
