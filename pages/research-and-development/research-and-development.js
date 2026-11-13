/* Research & Development — timeline arrows scroll the innovations track. */

(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  initTimeline();

  function initTimeline() {
    var root = document.querySelector("[data-timeline]");
    if (!root) return;

    var viewport = root.querySelector(".timelineViewport");
    var items = Array.prototype.slice.call(root.querySelectorAll(".timelineItem"));
    var prev = root.querySelector(".timelinePrev");
    var next = root.querySelector(".timelineNext");
    if (!viewport || !items.length || !prev || !next) return;

    function stepPx() {
      if (items.length < 2) return items[0].offsetWidth;
      return Math.max(1, items[1].offsetLeft - items[0].offsetLeft);
    }

    function maxScroll() {
      return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    }

    function behavior() {
      return reduceMotion.matches ? "auto" : "smooth";
    }

    function updateArrows() {
      var left = viewport.scrollLeft;
      var max = maxScroll();
      prev.disabled = left <= 1;
      next.disabled = left >= max - 1;
    }

    function scrollByStep(direction) {
      viewport.scrollBy({
        left: direction * stepPx(),
        behavior: behavior(),
      });
    }

    prev.addEventListener("click", function () {
      scrollByStep(-1);
    });
    next.addEventListener("click", function () {
      scrollByStep(1);
    });

    viewport.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);

    var pointerStartX = null;
    var startScroll = 0;
    var activePointerId = null;

    viewport.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      pointerStartX = event.clientX;
      startScroll = viewport.scrollLeft;
      activePointerId = event.pointerId;
      if (typeof viewport.setPointerCapture === "function") {
        viewport.setPointerCapture(event.pointerId);
      }
    });

    viewport.addEventListener("pointermove", function (event) {
      if (pointerStartX === null || event.pointerId !== activePointerId) return;
      viewport.scrollLeft = startScroll - (event.clientX - pointerStartX);
    });

    function endPointer(event) {
      if (event && event.pointerId !== activePointerId) return;
      pointerStartX = null;
      activePointerId = null;
      updateArrows();
    }

    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);

    updateArrows();
  }
})();
