(function () {
  var items = document.querySelectorAll(".faqItem");
  if (!items.length) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Height is tweened between measured pixel values rather than grid
     0fr → 1fr: iOS Safari re-lays out the grid every frame and stutters. */
  function settlePanel(item, panel) {
    if (panel._sizeTimer) window.clearTimeout(panel._sizeTimer);
    panel._sizeTimer = 0;
    panel.style.height = item.classList.contains("is-open") ? "auto" : "";
  }

  function sizePanel(item, isOpen) {
    var panel = item.querySelector(".faqPanel");
    if (!panel) return;

    if (panel._sizeTimer) window.clearTimeout(panel._sizeTimer);

    if (reduceMotion.matches) {
      panel.style.height = isOpen ? "auto" : "";
      return;
    }

    var from = panel.getBoundingClientRect().height;
    var to = isOpen ? panel.scrollHeight : 0;

    panel.style.height = from + "px";
    void panel.offsetHeight;
    panel.style.height = to + "px";

    // Backstop for when transitionend never fires
    panel._sizeTimer = window.setTimeout(function () {
      settlePanel(item, panel);
    }, 700);
  }

  items.forEach(function (item) {
    var trigger = item.querySelector(".faqTrigger");
    var panel = item.querySelector(".faqPanel");
    if (!trigger) return;

    if (panel) {
      panel.addEventListener("transitionend", function (event) {
        if (event.target !== panel || event.propertyName !== "height") return;
        settlePanel(item, panel);
      });
    }

    trigger.addEventListener("click", function () {
      var isOpen = item.classList.contains("is-open");

      items.forEach(function (otherItem) {
        var otherTrigger = otherItem.querySelector(".faqTrigger");
        if (!otherTrigger) return;
        if (otherItem.classList.contains("is-open")) {
          otherItem.classList.remove("is-open");
          otherTrigger.setAttribute("aria-expanded", "false");
          sizePanel(otherItem, false);
        }
      });

      if (!isOpen) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        sizePanel(item, true);
      }
    });
  });
})();
