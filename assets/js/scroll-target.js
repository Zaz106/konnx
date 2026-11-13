/* Hash / anchor scrolling — centres target sections in the viewport.
   Used by footer links, map CTA, contact quote links, and terms links. */

(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var TARGETS = {
    contactForm: resolveContactForm,
    contactFormSection: resolveContactForm,
    termsSection: resolveTermsSection,
  };

  function resolveContactForm() {
    return (
      document.querySelector(".contactFormCard") ||
      document.getElementById("contactForm") ||
      document.getElementById("contactFormSection")
    );
  }

  function resolveTermsSection() {
    return (
      document.getElementById("termsSection") ||
      document.querySelector(".termsSection")
    );
  }

  function centerElement(target) {
    if (!target) return false;
    target.scrollIntoView({
      behavior: reduceMotion.matches ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
    return true;
  }

  function selectQuoteEnquiry() {
    var quoteBtn = document.querySelector(
      '.contactEnquiryBtn[data-enquiry="Quote request"]'
    );
    if (quoteBtn) quoteBtn.click();
  }

  function alignFromHash() {
    var hash = window.location.hash;
    if (!hash || hash.charAt(0) !== "#") return;

    var key = hash.slice(1);
    var resolver = TARGETS[key];
    if (!resolver) return;

    var target = resolver();
    if (!target) return;

    if (key === "contactForm" || key === "contactFormSection") {
      selectQuoteEnquiry();
    }

    centerElement(target);
  }

  function scheduleAlign() {
    window.setTimeout(alignFromHash, 120);
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[href^='#']");
    if (!link) return;

    var href = link.getAttribute("href");
    if (!href || href === "#") return;

    var key = href.slice(1);
    if (!TARGETS[key]) return;

    event.preventDefault();

    if (history.replaceState) {
      history.replaceState(null, "", href);
    } else {
      window.location.hash = href;
    }

    alignFromHash();
  });

  if (window.location.hash) {
    alignFromHash();
    document.addEventListener("konnx:includes-ready", scheduleAlign);
    window.addEventListener("load", scheduleAlign);
  }

  window.addEventListener("hashchange", alignFromHash);
})();
