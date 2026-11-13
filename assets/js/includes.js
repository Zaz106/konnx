/**
 * HTML partial loader + colocated CSS/JS.
 *
 * <div data-include="/components/layout/header/header.html"></div>
 *   → injects HTML, loads header.css, loads header.js if it exists
 *
 * <body
 *   data-styles="/components/ui/button/button.css"
 *   data-scripts="/components/ui/reveal/reveal.js"
 * >
 */
(function () {
  var loadedCss = {};
  var loadedJs = {};

  // Bust caches on local dev so header/footer edits show immediately.
  // Production uses a static version so browsers can cache partials.
  var isLocalHost =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  var CACHE_BUST = isLocalHost ? "v=" + Date.now() : "v=7";

  function withCacheBust(url) {
    return url + (url.indexOf("?") === -1 ? "?" : "&") + CACHE_BUST;
  }

  function ensureCss(href) {
    if (!href || loadedCss[href]) return;
    loadedCss[href] = true;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = withCacheBust(href);
    document.head.appendChild(link);
  }

  function ensureJs(href) {
    if (!href || loadedJs[href]) return Promise.resolve();
    loadedJs[href] = true;

    return fetch(withCacheBust(href))
      .then(function (res) {
        if (!res.ok) {
          delete loadedJs[href];
          return;
        }
        return res.text().then(function (code) {
          var script = document.createElement("script");
          script.textContent = code;
          document.body.appendChild(script);
        });
      })
      .catch(function () {
        delete loadedJs[href];
      });
  }

  function siblingPath(htmlPath, ext) {
    return htmlPath.replace(/\.html$/i, ext);
  }

  // VS Code Live Server (and Five Server) inject a live-reload <script>
  // into every .html response — including these fetched partials.
  //
  // Without a </body> in the partial, Live Server falls back to injecting
  // before every </svg>. With two icons in the header that means two
  // injections, and the second one truncates the HTTP response mid-script
  // — deleting the burger button (.navToggle) and everything after it from
  // the bytes the browser receives. No client-side strip can restore
  // content that was never sent.
  //
  // Fix (two parts):
  //  1. Every HTML partial ends with a </body> sentinel so Live Server
  //     injects at the end of the file instead of mid-SVG.
  //  2. This function strips the injected block AND the sentinel before
  //     the markup is written into the page.
  function stripDevServerInjection(html) {
    // Complete injected blocks (comment + closed <script>).
    html = html.replace(
      /<!--\s*Code injected by (?:live|five)-server\s*-->\s*<script[\s\S]*?<\/script>/gi,
      ""
    );
    // Incomplete trailing injection (Live Server truncated mid-script).
    html = html.replace(
      /<!--\s*Code injected by (?:live|five)-server\s*-->[\s\S]*$/gi,
      ""
    );
    // Sentinels we append to partials so Live Server has a </body> target.
    html = html.replace(/\s*<\/(?:body|html)>\s*$/gi, "");
    return html;
  }

  function parseList(value) {
    if (!value) return [];
    return value
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  async function inject(el) {
    var src = el.getAttribute("data-include");
    if (!src) return;

    ensureCss(siblingPath(src, ".css"));

    try {
      var res = await fetch(withCacheBust(src));
      if (!res.ok) throw new Error(res.status + " " + src);
      var html = stripDevServerInjection(await res.text());
      el.outerHTML = html;
      await ensureJs(siblingPath(src, ".js"));
    } catch (err) {
      console.error("[includes]", err);
      el.innerHTML =
        "<!-- include failed: " + src + " — serve via local server -->";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    parseList(document.body.getAttribute("data-styles")).forEach(ensureCss);

    var pageScripts = parseList(document.body.getAttribute("data-scripts"));
    var nodes = Array.from(document.querySelectorAll("[data-include]"));

    Promise.all(nodes.map(inject))
      .then(function () {
        return Promise.all(pageScripts.map(ensureJs));
      })
      .then(function () {
        return ensureJs("/assets/js/scroll-target.js");
      })
      .then(function () {
        document.dispatchEvent(new CustomEvent("konnx:includes-ready"));
      });
  });
})();
