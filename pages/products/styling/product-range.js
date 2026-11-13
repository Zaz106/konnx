(function () {
  var root = document.querySelector("[data-product-carousel]");
  if (!root) return;

  var slides = Array.prototype.slice.call(
    root.querySelectorAll(".productSlide")
  );
  var thumbs = Array.prototype.slice.call(
    root.querySelectorAll(".productThumb")
  );
  var thumbsRail = root.querySelector(".productThumbs");
  var dots = Array.prototype.slice.call(
    root.querySelectorAll(".productDot")
  );
  if (!slides.length) return;

  slides.forEach(function (slide) {
    slide.setAttribute("draggable", "false");
  });

  // Thumbs (desktop) and dots (stacked layout) both drive the same slides —
  // whichever set is present/visible stays in sync via this shared list.
  var controlGroups = [thumbs, dots].filter(function (group) {
    return group.length === slides.length;
  });

  var index = 0;
  var timer = null;
  var INTERVAL_MS = 2600;
  var VISIBLE_THUMB_COUNT = 5;
  var thumbWindowStart = 0;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function maxThumbWindowStart() {
    return Math.max(0, thumbs.length - VISIBLE_THUMB_COUNT);
  }

  function getThumbStepPx() {
    if (!thumbsRail || thumbs.length < 2) return 0;
    var first = thumbs[0].getBoundingClientRect();
    var second = thumbs[1].getBoundingClientRect();
    return Math.max(0, second.left - first.left);
  }

  function scrollThumbWindow(start, behavior) {
    if (!thumbsRail || thumbs.length <= VISIBLE_THUMB_COUNT) return;
    var step = getThumbStepPx();
    if (!step) return;

    thumbWindowStart = Math.min(Math.max(0, start), maxThumbWindowStart());
    thumbsRail.scrollTo({
      left: thumbWindowStart * step,
      behavior: behavior || "smooth",
    });
  }

  function alignThumbWindowForActive() {
    if (thumbs.length <= VISIBLE_THUMB_COUNT) return;
    var end = thumbWindowStart + VISIBLE_THUMB_COUNT - 1;
    if (index > end) {
      scrollThumbWindow(index - VISIBLE_THUMB_COUNT + 1);
    } else if (index < thumbWindowStart) {
      scrollThumbWindow(index);
    }
  }

  function show(next) {
    if (next === index) return;
    slides[index].classList.remove("is-active");
    slides[index].setAttribute("aria-hidden", "true");
    controlGroups.forEach(function (group) {
      group[index].classList.remove("is-active");
      group[index].setAttribute("aria-selected", "false");
    });

    index = next;

    slides[index].classList.add("is-active");
    slides[index].setAttribute("aria-hidden", "false");
    controlGroups.forEach(function (group) {
      group[index].classList.add("is-active");
      group[index].setAttribute("aria-selected", "true");
    });

    alignThumbWindowForActive();
  }

  slides.forEach(function (slide, i) {
    slide.setAttribute("aria-hidden", i === 0 ? "false" : "true");
  });

  function nextSlide() {
    show((index + 1) % slides.length);
  }

  function stopAutoplay() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();
    if (reduceMotion.matches) return;
    timer = window.setInterval(nextSlide, INTERVAL_MS);
  }

  controlGroups.forEach(function (group) {
    group.forEach(function (control, i) {
      control.addEventListener("click", function () {
        if (
          group === thumbs &&
          thumbs.length > VISIBLE_THUMB_COUNT &&
          i === thumbWindowStart &&
          thumbWindowStart > 0
        ) {
          scrollThumbWindow(thumbWindowStart - 1);
        } else if (
          group === thumbs &&
          thumbs.length > VISIBLE_THUMB_COUNT &&
          i === thumbWindowStart + VISIBLE_THUMB_COUNT - 1 &&
          thumbWindowStart < maxThumbWindowStart()
        ) {
          scrollThumbWindow(thumbWindowStart + 1);
        }

        show(i);
        startAutoplay();
      });
    });
  });

  if (thumbsRail) {
    window.addEventListener("resize", function () {
      scrollThumbWindow(thumbWindowStart, "auto");
    });
  }

  root.addEventListener("mouseenter", stopAutoplay);
  root.addEventListener("mouseleave", startAutoplay);
  root.addEventListener("focusin", stopAutoplay);
  root.addEventListener("focusout", function (event) {
    if (!root.contains(event.relatedTarget)) startAutoplay();
  });

  // Swipe support — pointer drag on the main image steps through slides
  var mainImage = root.querySelector(".productMainImage");
  var pointerStartX = null;
  var activePointerId = null;
  var SWIPE_THRESHOLD_PX = 40;

  if (mainImage) {
    mainImage.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });

    mainImage.addEventListener(
      "pointerdown",
      function (event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointerStartX = event.clientX;
        activePointerId = event.pointerId;
        if (typeof mainImage.setPointerCapture === "function") {
          mainImage.setPointerCapture(event.pointerId);
        }
        stopAutoplay();
      },
      { passive: true }
    );

    mainImage.addEventListener(
      "pointerup",
      function (event) {
        if (pointerStartX === null || event.pointerId !== activePointerId) return;
        var deltaX = event.clientX - pointerStartX;
        pointerStartX = null;
        activePointerId = null;

        if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
          var direction = deltaX < 0 ? 1 : -1;
          show((index + direction + slides.length) % slides.length);
        }
        startAutoplay();
      },
      { passive: true }
    );

    mainImage.addEventListener(
      "pointercancel",
      function () {
        pointerStartX = null;
        activePointerId = null;
        startAutoplay();
      },
      { passive: true }
    );
  }

  if (typeof reduceMotion.addEventListener === "function") {
    reduceMotion.addEventListener("change", function () {
      if (reduceMotion.matches) stopAutoplay();
      else startAutoplay();
    });
  }

  startAutoplay();
})();

/* Product information tabs — Specifications / Downloads / Features & Benefits */
(function () {
  var root = document.querySelector("[data-product-tabs]");
  if (!root) return;

  var list = root.querySelector(".productTabList");
  var tabs = Array.prototype.slice.call(root.querySelectorAll(".productTab"));
  var panels = Array.prototype.slice.call(
    root.querySelectorAll(".productPanel")
  );
  if (!tabs.length || !panels.length) return;

  function activate(tab, moveFocus) {
    var target = tab.getAttribute("data-tab-target");

    tabs.forEach(function (t) {
      var isActive = t === tab;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) t.removeAttribute("tabindex");
      else t.setAttribute("tabindex", "-1");
    });

    panels.forEach(function (panel) {
      var isMatch = panel.getAttribute("data-tab-panel") === target;
      panel.classList.toggle("is-active", isMatch);
      if (isMatch) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });

    if (moveFocus) tab.focus();
    revealTab(tab);
  }

  // Keeps the active label in view when the tab row scrolls sideways on mobile
  function revealTab(tab) {
    if (!list || list.scrollWidth <= list.clientWidth) return;
    var left = tab.offsetLeft;
    var right = left + tab.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth;
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () {
      activate(tab, false);
    });

    tab.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (event.key === "ArrowLeft")
        next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (event.key === "Home") next = tabs[0];
      else if (event.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      activate(next, true);
    });
  });
})();
