(function () {
  var header = document.querySelector(".siteHeader");
  if (!header) return;

  var toggle = header.querySelector(".navToggle");
  var nav = header.querySelector(".nav");
  var dropdown = header.querySelector(".navDropdown");
  var dropdownToggle = header.querySelector(".navDropdownToggle");
  var compactQuery = window.matchMedia("(max-width: 1024px)");
  var isHomePage = document.body.classList.contains("homePage");
  // Pages with sticky layouts measured against the bar (product pages) opt
  // out of hide-on-scroll so their content never jumps when it slides away.
  var isPinned = document.body.hasAttribute("data-header-pinned");
  var lockedScrollY = 0;

  function lockScroll() {
    lockedScrollY = window.scrollY || 0;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = "-" + lockedScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
  }

  function unlockScroll() {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    window.scrollTo(0, lockedScrollY);
  }

  function setNavOpen(open) {
    if (!nav || !toggle) return;

    nav.classList.toggle("is-open", open);
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");

    if (open) {
      header.classList.add("is-navOpen");
      header.classList.remove("is-hidden");
      updateHomeTopState(window.scrollY);
      lockScroll();
    } else {
      unlockScroll();
      header.classList.remove("is-navOpen");
      updateHomeTopState(window.scrollY);
      if (dropdown) dropdown.classList.remove("is-open");
      if (dropdownToggle) dropdownToggle.setAttribute("aria-expanded", "false");
      if (nav) nav.classList.remove("is-searching");
    }

    if (typeof window.konnxOnMobileNavToggle === "function") {
      window.konnxOnMobileNavToggle(open);
    }
  }

  function closeMobileNav() {
    if (!nav || !nav.classList.contains("is-open")) return;
    setNavOpen(false);
  }

  function openMobileNav() {
    setNavOpen(true);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      if (nav.classList.contains("is-open")) {
        closeMobileNav();
      } else {
        openMobileNav();
      }
    });

    // Click empty space inside the overlay (not a link / pill / dropdown
    // control) closes the menu — same idea as the Floema-style reference.
    nav.addEventListener("click", function (event) {
      var hit = event.target.closest("a, button, input, .navDropdown, .headerSearch");
      if (!hit) closeMobileNav();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMobileNav();
    });

    Array.prototype.slice.call(nav.querySelectorAll("a")).forEach(function (link) {
      link.addEventListener("click", closeMobileNav);
    });
  }

  if (dropdown && dropdownToggle) {
    function setDropdownOpen(open) {
      dropdown.classList.toggle("is-open", open);
      dropdownToggle.setAttribute("aria-expanded", open ? "true" : "false");
      updateHomeTopState(window.scrollY);
    }

    dropdown.addEventListener("mouseenter", function () {
      if (compactQuery.matches) return;
      setDropdownOpen(true);
    });

    dropdown.addEventListener("mouseleave", function () {
      if (compactQuery.matches) return;
      setDropdownOpen(false);
    });

    dropdownToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      if (!compactQuery.matches) {
        setDropdownOpen(true);
        return;
      }
      setDropdownOpen(!dropdown.classList.contains("is-open"));
    });

    document.addEventListener("click", function (event) {
      if (!dropdown.contains(event.target)) {
        setDropdownOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    });
  }

  // Search open/close lives in components/search/search.js.

  function handleCompactChange(event) {
    if (!event.matches) closeMobileNav();
  }

  if (compactQuery.addEventListener) {
    compactQuery.addEventListener("change", handleCompactChange);
  } else if (compactQuery.addListener) {
    compactQuery.addListener(handleCompactChange);
  }

  // Hide the header on scroll-down, reveal on scroll-up — never while the
  // mobile menu is open. Hide as soon as the user scrolls past a small
  // threshold so the bar clears the screen quickly on the first scroll.
  var lastScrollY = window.scrollY;
  var ticking = false;
  var hideAfterY = 24;

  function updateHomeTopState(currentY) {
    if (!isHomePage) return;
    var dropdownOpen = dropdown && dropdown.classList.contains("is-open");
    var searchOpen = header.classList.contains("is-searchOpen");
    var shouldBeSolid =
      currentY > 8 ||
      header.classList.contains("is-navOpen") ||
      dropdownOpen ||
      searchOpen;
    header.classList.toggle("is-homeSolid", shouldBeSolid);
  }

  function updateHeaderVisibility() {
    var currentY = window.scrollY;
    updateHomeTopState(currentY);

    if (
      isPinned ||
      header.classList.contains("is-navOpen") ||
      header.classList.contains("is-searchOpen")
    ) {
      header.classList.remove("is-hidden");
    } else if (currentY <= hideAfterY || currentY < lastScrollY) {
      header.classList.remove("is-hidden");
    } else if (currentY > lastScrollY) {
      header.classList.add("is-hidden");
    }

    lastScrollY = currentY;
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (dropdown && dropdown.classList.contains("is-open")) {
        dropdown.classList.remove("is-open");
        dropdownToggle.setAttribute("aria-expanded", "false");
        updateHomeTopState(window.scrollY);
      }

      if (!ticking) {
        window.requestAnimationFrame(updateHeaderVisibility);
        ticking = true;
      }
    },
    { passive: true }
  );

  updateHomeTopState(window.scrollY);

  // Expose close helper for search.js (closes menu before opening search).
  window.konnxCloseMobileNav = closeMobileNav;
})();
