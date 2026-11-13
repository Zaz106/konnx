(function () {
  var items = document.querySelectorAll(".faqItem");
  if (!items.length) return;

  items.forEach(function (item) {
    var trigger = item.querySelector(".faqTrigger");
    if (!trigger) return;

    trigger.addEventListener("click", function () {
      var isOpen = item.classList.contains("is-open");

      items.forEach(function (otherItem) {
        var otherTrigger = otherItem.querySelector(".faqTrigger");
        if (!otherTrigger) return;
        otherItem.classList.remove("is-open");
        otherTrigger.setAttribute("aria-expanded", "false");
      });

      if (!isOpen) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  });
})();
