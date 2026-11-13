(function () {
  var compactQuery = window.matchMedia("(max-width: 1024px)");
  var widthTimer = null;
  var closeWidthTimer = null;
  var PRODUCT_LISTINGS = [
    {
      url: "/pages/products/low-voltage-connectors/index.html",
      voltage: "Low Voltage",
    },
    {
      url: "/pages/products/high-voltage-connectors/index.html",
      voltage: "High Voltage",
    },
  ];
  var productIndex = [];
  var indexReady = false;
  var pendingQuery = null;

  function getHeaderSearch() {
    return document.querySelector(".headerSearch");
  }

  function getHeader() {
    return document.querySelector(".siteHeader");
  }

  function getDesktopInput() {
    var root = getHeaderSearch();
    return root ? root.querySelector("#header-search-input") : null;
  }

  function getDesktopBar() {
    var root = getHeaderSearch();
    return root ? root.querySelector(".headerSearchBar") : null;
  }

  function getDesktopPanel() {
    var root = getHeaderSearch();
    return root ? root.querySelector("#header-search-panel") : null;
  }

  function getDesktopToggle() {
    var root = getHeaderSearch();
    return root ? root.querySelector(".searchToggle") : null;
  }

  function isCompact() {
    return compactQuery.matches;
  }

  function resolveUrl(basePath, href) {
    if (!href) return "";
    try {
      return new URL(href, new URL(basePath, window.location.href)).href;
    } catch (err) {
      return href;
    }
  }

  function normaliseText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function extractPageText(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var parts = [];
    if (doc.title) parts.push(doc.title);
    var meta = doc.querySelector('meta[name="description"]');
    if (meta) parts.push(meta.getAttribute("content") || "");
    var main = doc.querySelector("main");
    if (main) {
      Array.prototype.slice
        .call(main.querySelectorAll("script, style, noscript"))
        .forEach(function (node) {
          node.parentNode.removeChild(node);
        });
      parts.push(main.textContent);
    }
    return normaliseText(parts.join(" "));
  }

  function parseListingCards(html, listingUrl, voltage) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    return Array.prototype.map.call(doc.querySelectorAll("a.productCard"), function (card) {
      var img = card.querySelector(".cardImage img");
      return {
        url: resolveUrl(listingUrl, card.getAttribute("href") || ""),
        image: img ? resolveUrl(listingUrl, img.getAttribute("src") || "") : "",
        name: textOf(card.querySelector(".cardName")),
        spec: textOf(card.querySelector(".cardSpec")),
        voltage: voltage,
        listingText: normaliseText(
          [
            textOf(card.querySelector(".cardName")),
            textOf(card.querySelector(".cardSub")),
            textOf(card.querySelector(".cardType")),
            textOf(card.querySelector(".cardSpec")),
            voltage,
            card.getAttribute("aria-label") || "",
          ].join(" ")
        ),
        searchText: "",
      };
    });
  }

  function fetchHtml(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    });
  }

  function loadListing(listing) {
    return fetchHtml(listing.url)
      .then(function (html) {
        return parseListingCards(html, listing.url, listing.voltage);
      })
      .catch(function () {
        return [];
      });
  }

  function enrichProduct(item) {
    if (!item.url) {
      item.searchText = item.listingText;
      return Promise.resolve(item);
    }
    return fetchHtml(item.url)
      .then(function (html) {
        item.searchText = [item.listingText, extractPageText(html)].join(" ").trim();
        return item;
      })
      .catch(function () {
        item.searchText = item.listingText;
        return item;
      });
  }

  function buildProductIndex() {
    return Promise.all(PRODUCT_LISTINGS.map(loadListing))
      .then(function (groups) {
        var items = [];
        groups.forEach(function (group) {
          items = items.concat(group);
        });
        return Promise.all(items.map(enrichProduct));
      })
      .then(function (items) {
        productIndex = items.filter(function (item) {
          return item && item.url && item.name;
        });
        indexReady = true;
        if (pendingQuery !== null) {
          renderResults(pendingQuery);
          pendingQuery = null;
        }
      })
      .catch(function () {
        indexReady = true;
        productIndex = [];
      });
  }

  function matchItems(query) {
    var q = normaliseText(query);
    if (!q) return [];
    return productIndex.filter(function (item) {
      return (item.searchText || item.listingText || "").indexOf(q) !== -1;
    });
  }

  function closeProductsDropdown() {
    var dropdown = document.querySelector(".navDropdown");
    var dropdownToggle = document.querySelector(".navDropdownToggle");
    if (dropdown) dropdown.classList.remove("is-open");
    if (dropdownToggle) dropdownToggle.setAttribute("aria-expanded", "false");
  }

  function syncHomeSolid() {
    var header = getHeader();
    if (!header || !document.body.classList.contains("homePage")) return;
    var dropdownOpen = header.querySelector(".navDropdown.is-open");
    var shouldBeSolid =
      window.scrollY > 8 ||
      header.classList.contains("is-navOpen") ||
      header.classList.contains("is-searchOpen") ||
      !!dropdownOpen;
    header.classList.toggle("is-homeSolid", shouldBeSolid);
  }

  function getExpandedWidth() {
    var nav = document.querySelector(".nav");
    var search = getHeaderSearch();
    var brand = document.querySelector(".brand");
    if (!nav || !search) return 360;
    var navRect = nav.getBoundingClientRect();
    var searchRect = search.getBoundingClientRect();
    var extra = 96;
    var left = navRect.left - extra;
    if (brand) {
      var minLeft = brand.getBoundingClientRect().right + 24;
      if (left < minLeft) left = minLeft;
    }
    return Math.max(Math.round(searchRect.right - left), 320);
  }

  function capResultsHeight() {
    if (isCompact()) return;
    var panel = getDesktopPanel();
    if (!panel) return;
    if (panel.hasAttribute("hidden") || !panel.querySelector(".searchResultCard")) {
      panel.style.maxHeight = "";
      return;
    }

    var card = panel.querySelector(".searchResultCard");
    var grid = panel.querySelector(".searchResultsGrid");
    var heading = panel.querySelector(".searchResultsHeading");
    var panelStyles = window.getComputedStyle(panel);
    var paddingTop = parseFloat(panelStyles.paddingTop) || 0;
    var headingH = 0;
    if (heading) {
      var headingStyles = window.getComputedStyle(heading);
      headingH =
        heading.getBoundingClientRect().height +
        (parseFloat(headingStyles.marginBottom) || 0);
    }
    var rowGap = grid ? parseFloat(window.getComputedStyle(grid).rowGap) || 0 : 0;
    var cardH = card.getBoundingClientRect().height;
    if (!cardH) return;
    panel.style.maxHeight =
      Math.round(paddingTop + headingH + cardH * 1.8 + rowGap * 0.8) + "px";
  }

  function applyExpandedWidth() {
    if (isCompact()) return;
    var bar = getDesktopBar();
    var panel = getDesktopPanel();
    if (!bar) return;
    var width = getExpandedWidth() + "px";
    bar.style.width = width;
    if (panel) panel.style.width = width;
    window.requestAnimationFrame(function () {
      capResultsHeight();
    });
  }

  function isDesktopOpen() {
    var root = getHeaderSearch();
    return !!(root && root.classList.contains("is-open"));
  }

  function getNav() {
    return document.querySelector(".nav");
  }

  function setSearching(active) {
    var nav = getNav();
    if (nav) nav.classList.toggle("is-searching", !!active);
  }

  function hideDesktopPanel() {
    var panel = getDesktopPanel();
    if (!panel) return;
    panel.innerHTML = "";
    panel.style.maxHeight = "";
    panel.setAttribute("hidden", "");
  }

  function renderResults(query) {
    var panel = getDesktopPanel();
    if (!panel) return;

    setSearching(!!query);
    panel.innerHTML = "";
    panel.style.maxHeight = "";
    if (!query) {
      panel.setAttribute("hidden", "");
      return;
    }

    var matches = matchItems(query);
    if (!matches.length) {
      var empty = document.createElement("h3");
      empty.className = "searchResultsHeading";
      empty.textContent = 'No results for "' + query + '"';
      panel.appendChild(empty);
      panel.removeAttribute("hidden");
      return;
    }

    var productGroup = document.createElement("div");
    productGroup.className = "searchResultsGroup";

    var productHeading = document.createElement("h3");
    productHeading.className = "searchResultsHeading";
    productHeading.textContent = "Products";
    productGroup.appendChild(productHeading);

    var grid = document.createElement("div");
    grid.className = "searchResultsGrid";

    matches.forEach(function (item) {
      var card = document.createElement("a");
      card.className = "searchResultCard";
      card.href = item.url;
      card.setAttribute("aria-label", "View " + item.name);

      var imageWrap = document.createElement("div");
      imageWrap.className = "searchResultImage";
      if (item.image) {
        var img = document.createElement("img");
        img.src = item.image;
        img.alt = item.name;
        imageWrap.appendChild(img);
      }

      var body = document.createElement("div");
      body.className = "searchResultBody";

      var name = document.createElement("span");
      name.className = "searchResultName";
      name.textContent = item.name;
      body.appendChild(name);

      if (item.spec) {
        var desc = document.createElement("p");
        desc.className = "searchResultDesc";
        desc.textContent = item.spec;
        body.appendChild(desc);
      }

      card.appendChild(imageWrap);
      card.appendChild(body);
      grid.appendChild(card);
    });

    productGroup.appendChild(grid);
    panel.appendChild(productGroup);

    panel.removeAttribute("hidden");
    window.requestAnimationFrame(function () {
      capResultsHeight();
    });
  }

  function resetMobileSearch() {
    var input = getDesktopInput();
    if (input) {
      input.value = "";
      input.blur();
    }
    hideDesktopPanel();
    setSearching(false);
  }

  function openDesktop() {
    if (isCompact()) return;
    var root = getHeaderSearch();
    var header = getHeader();
    var input = getDesktopInput();
    var toggle = getDesktopToggle();
    var bar = getDesktopBar();
    if (!root || !bar) return;

    closeProductsDropdown();
    if (closeWidthTimer) {
      window.clearTimeout(closeWidthTimer);
      closeWidthTimer = null;
    }

    root.classList.add("is-open");
    if (header) header.classList.add("is-searchOpen");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close search");
    }
    if (input) input.setAttribute("tabindex", "0");
    applyExpandedWidth();
    syncHomeSolid();

    window.setTimeout(function () {
      if (input && isDesktopOpen()) input.focus();
    }, 220);
  }

  function closeDesktop() {
    var root = getHeaderSearch();
    var header = getHeader();
    var input = getDesktopInput();
    var toggle = getDesktopToggle();
    var bar = getDesktopBar();
    var panel = getDesktopPanel();
    if (!root) return;

    if (bar && !isCompact()) bar.style.width = "2.75rem";
    root.classList.remove("is-open");
    if (header) header.classList.remove("is-searchOpen");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Search");
    }
    if (input) {
      input.blur();
      input.value = "";
      if (!isCompact()) input.setAttribute("tabindex", "-1");
    }
    hideDesktopPanel();
    setSearching(false);
    if (panel) panel.style.maxHeight = "";
    syncHomeSolid();

    if (closeWidthTimer) window.clearTimeout(closeWidthTimer);
    closeWidthTimer = window.setTimeout(function () {
      if (!isDesktopOpen()) {
        if (bar) bar.style.width = "";
        if (panel) panel.style.width = "";
      }
      closeWidthTimer = null;
    }, 480);
  }

  function focusMobileSearch() {
    var input = getDesktopInput();
    if (!input) return;
    input.setAttribute("tabindex", "0");
    input.focus();
  }

  window.konnxOnMobileNavToggle = function (open) {
    if (!isCompact()) return;
    var input = getDesktopInput();
    if (open) {
      if (input) input.setAttribute("tabindex", "0");
      return;
    }
    if (input) input.setAttribute("tabindex", "-1");
    resetMobileSearch();
  };

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest(".searchToggle");

    if (toggle && isCompact()) {
      event.preventDefault();
      event.stopPropagation();
      focusMobileSearch();
      return;
    }

    if (toggle && !isCompact()) {
      event.preventDefault();
      event.stopPropagation();
      if (isDesktopOpen()) {
        closeDesktop();
      } else {
        openDesktop();
      }
      return;
    }

    if (isDesktopOpen() && !isCompact() && !event.target.closest(".headerSearch")) {
      closeDesktop();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (isDesktopOpen()) closeDesktop();
  });

  document.addEventListener("submit", function (event) {
    if (event.target.closest(".headerSearchForm")) {
      event.preventDefault();
    }
  });

  document.addEventListener("input", function (event) {
    if (event.target.id !== "header-search-input") return;
    var query = event.target.value.trim();
    if (!indexReady) {
      pendingQuery = query;
      return;
    }
    renderResults(query);
  });

  window.addEventListener(
    "scroll",
    function () {
      if (isDesktopOpen() && !isCompact()) closeDesktop();
    },
    { passive: true }
  );

  function handleCompactChange(event) {
    var bar = getDesktopBar();
    var panel = getDesktopPanel();
    var input = getDesktopInput();
    if (event.matches) {
      if (isDesktopOpen()) closeDesktop();
      if (bar) bar.style.width = "";
      if (panel) panel.style.width = "";
      return;
    }
    resetMobileSearch();
    if (input && !isDesktopOpen()) input.setAttribute("tabindex", "-1");
  }

  if (compactQuery.addEventListener) {
    compactQuery.addEventListener("change", handleCompactChange);
  } else if (compactQuery.addListener) {
    compactQuery.addListener(handleCompactChange);
  }

  window.addEventListener("resize", function () {
    if (isCompact() || !isDesktopOpen()) return;
    if (widthTimer) window.clearTimeout(widthTimer);
    widthTimer = window.setTimeout(function () {
      if (isDesktopOpen()) applyExpandedWidth();
      widthTimer = null;
    }, 80);
  });

  buildProductIndex();
})();
