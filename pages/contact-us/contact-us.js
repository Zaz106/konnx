/* Contact Us page — enquiry type toggle + char counter.
   Frontend only — form submit is blocked until WordPress integration. */

(function () {
  var form = document.getElementById("contactForm");
  if (!form) return;

  var enquiryInput = document.getElementById("contact-enquiry-type");
  var enquiryButtons = form.querySelectorAll(".contactEnquiryBtn");
  var messageField = document.getElementById("contact-message");
  var charCount = document.getElementById("contactCharCount");
  var submitBtn = form.querySelector(".contactFormSubmit");

  enquiryButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var value = button.getAttribute("data-enquiry") || "";

      enquiryButtons.forEach(function (item) {
        item.classList.remove("is-active");
      });

      button.classList.add("is-active");

      if (enquiryInput) {
        enquiryInput.value = value;
      }

      if (submitBtn) {
        submitBtn.disabled = !value;
      }
    });
  });

  if (messageField && charCount) {
    var updateCount = function () {
      charCount.textContent = String(messageField.value.length);
    };

    messageField.addEventListener("input", updateCount);
    updateCount();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });
})();
