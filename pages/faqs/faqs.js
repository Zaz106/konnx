(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll(".faqItem"));
  if (!items.length) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var DURATION = 350;
  var EASING = "ease";

  /* Ground-up accordion: Web Animations API owns the height tween.
     No CSS height transitions — those fight WAAPI and stutter on iOS. */

  function measureContentHeight(panel) {
    var prevHeight = panel.style.height;
    var prevOverflow = panel.style.overflow;
    panel.style.overflow = "hidden";
    panel.style.height = "auto";
    var height = panel.scrollHeight;
    panel.style.height = prevHeight;
    panel.style.overflow = prevOverflow;
    return height;
  }

  function cancelAnim(panel) {
    if (!panel._accordionAnim) return;
    var anim = panel._accordionAnim;
    panel._accordionAnim = null;
    anim.onfinish = null;
    try {
      anim.cancel();
    } catch (err) {}
  }

  function snap(panel, open) {
    panel.style.height = open ? "auto" : "0px";
    panel.style.overflow = open ? "" : "hidden";
  }

  function animatePanel(panel, open) {
    cancelAnim(panel);

    if (reduceMotion.matches || typeof panel.animate !== "function") {
      snap(panel, open);
      return;
    }

    var from = panel.getBoundingClientRect().height;
    var to = open ? measureContentHeight(panel) : 0;

    panel.style.overflow = "hidden";
    panel.style.height = from + "px";

    if (Math.round(from) === Math.round(to)) {
      snap(panel, open);
      return;
    }

    var anim = panel.animate(
      [{ height: from + "px" }, { height: to + "px" }],
      { duration: DURATION, easing: EASING, fill: "forwards" }
    );
    panel._accordionAnim = anim;

    anim.onfinish = function () {
      if (panel._accordionAnim !== anim) return;
      panel._accordionAnim = null;
      try {
        if (typeof anim.commitStyles === "function") anim.commitStyles();
        anim.cancel();
      } catch (err) {}
      snap(panel, open);
    };
  }

  function setItemOpen(item, open) {
    var trigger = item.querySelector(".faqTrigger");
    var panel = item.querySelector(".faqPanel");
    var wasOpen = item.classList.contains("is-open");

    item.classList.toggle("is-open", open);
    if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (!panel) return;
    if (open === wasOpen) return;
    animatePanel(panel, open);
  }

  items.forEach(function (item) {
    var trigger = item.querySelector(".faqTrigger");
    var panel = item.querySelector(".faqPanel");
    if (!trigger || !panel) return;

    panel.style.height = "0px";
    panel.style.overflow = "hidden";

    trigger.addEventListener("click", function () {
      var opening = !item.classList.contains("is-open");

      items.forEach(function (other) {
        if (other === item) return;
        if (other.classList.contains("is-open")) setItemOpen(other, false);
      });

      setItemOpen(item, opening);
    });
  });
})();
