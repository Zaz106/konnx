/* Home page — hero intro motion, product Long Arc wipe, coupler outline draw.
   Safety section uses a poster + click-to-play local video.
   Map network animation now lives in components/layout/map/map.js. */

(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  initHeroVideo();
  initProductsAnchorScroll();
  initHomeReveals();

  var productCards = document.querySelectorAll(".productRangeCard");
  if (productCards.length) {
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      productCards.forEach(function (card) {
        card.classList.add("is-arcInView");
      });
    } else {
      var arcObserver = new IntersectionObserver(
        function (entries, observer) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-arcInView");
            observer.unobserve(entry.target);
          });
        },
        {
          threshold: 0.35,
          rootMargin: "0px 0px -10% 0px",
        }
      );

      productCards.forEach(function (card) {
        arcObserver.observe(card);
      });
    }
  }

  /* Hero background video — pause when the user prefers reduced motion */
  function initHeroVideo() {
    var video = document.querySelector(".heroSection .heroVideo");
    if (!video) return;

    function syncMotion() {
      if (reduceMotion.matches) {
        video.pause();
        return;
      }
      var play = video.play();
      if (play && typeof play.catch === "function") {
        play.catch(function () {});
      }
    }

    syncMotion();
    if (typeof reduceMotion.addEventListener === "function") {
      reduceMotion.addEventListener("change", syncMotion);
    } else if (typeof reduceMotion.addListener === "function") {
      reduceMotion.addListener(syncMotion);
    }
  }

  /* Hero CTA → #products: land so card CTAs are well into view */
  function initProductsAnchorScroll() {
    var section = document.getElementById("products");
    if (!section) return;

    function headerOffset() {
      var header = document.querySelector(".siteHeader");
      return header ? header.offsetHeight : 88;
    }

    function scrollProductsIntoFocus() {
      var grid = section.querySelector(".productsGrid") || section;
      var headerH = headerOffset();
      var viewH = window.innerHeight;
      var bottomPad = Math.max(24, Math.round(viewH * 0.06));
      var topPad = headerH + 16;

      var gridTop = grid.getBoundingClientRect().top + window.pageYOffset;
      var gridHeight = grid.offsetHeight;
      var available = viewH - topPad - bottomPad;
      var target;

      if (gridHeight <= available) {
        // Cards fit — centre the grid in the space under the header
        target = gridTop - topPad - (available - gridHeight) / 2;
      } else {
        // Cards taller than the viewport — pin so CTAs sit above the fold
        target = gridTop + gridHeight - viewH + bottomPad;
      }

      window.scrollTo({
        top: Math.max(0, Math.round(target)),
        behavior: reduceMotion.matches ? "auto" : "smooth",
      });
    }

    document.querySelectorAll('a[href="#products"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        scrollProductsIntoFocus();
        if (history.replaceState) {
          history.replaceState(null, "", "#products");
        }
      });
    });

    if (window.location.hash === "#products") {
      window.setTimeout(scrollProductsIntoFocus, 50);
    }
  }

  // Poster → HTML5 video on click (local asset, same UX as former YouTube embed)
  var safetyVideo = document.querySelector(".safetyVideo");
  if (safetyVideo) {
    var playBtn = safetyVideo.querySelector(".safetyVideoPlay");
    var videoSrc = safetyVideo.getAttribute("data-video-src");
    if (playBtn && videoSrc) {
      playBtn.addEventListener("click", function () {
        var video = document.createElement("video");
        video.src = videoSrc;
        video.controls = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.title = "KonNx performance and safety video";
        video.addEventListener("loadeddata", function () {
          var play = video.play();
          if (play && typeof play.catch === "function") {
            play.catch(function () {});
          }
        });
        safetyVideo.appendChild(video);
        safetyVideo.classList.add("is-playing");
      });
    }
  }

  function initHomeReveals() {
    var nodes = document.querySelectorAll(
      [
        ".introLead",
        ".introBody",
        ".productsHeading",
        ".safetyHeading",
        ".safetyBody",
        ".innovationsHeading",
        ".innovationsBody",
      ].join(",")
    );

    if (!nodes.length) return;

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(nodes, function (node) {
        node.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    Array.prototype.forEach.call(nodes, function (node) {
      node.classList.add("homeReveal");
      observer.observe(node);
    });
  }

  initCouplerOutlineDraw();

  function initCouplerOutlineDraw() {
    var host = document.querySelector(".innovationsImage[data-coupler-src]");
    if (!host) return;

    var src = host.getAttribute("data-coupler-src");
    if (!src) return;

    fetch(src)
      .then(function (res) {
        if (!res.ok) throw new Error("Coupler SVG fetch failed");
        return res.text();
      })
      .then(function (markup) {
        host.innerHTML = markup;
        var svg = host.querySelector("svg");
        if (!svg) return;

        svg.setAttribute("role", "presentation");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        if (!svg.getAttribute("viewBox")) {
          svg.setAttribute("viewBox", "0 0 792 468");
        }

        var paths = Array.prototype.slice.call(svg.querySelectorAll("path"));
        var prepared = [];

        paths.forEach(function (path) {
          var length = 0;
          try {
            length = path.getTotalLength();
          } catch (err) {
            return;
          }
          if (length < 0.5) return;

          path.style.strokeDasharray = String(length);
          path.style.strokeDashoffset = String(length);
          path.style.transition = "none";
          prepared.push({ el: path, length: length });
        });

        host.classList.add("is-ready");

        function drawCoupler() {
          prepared.forEach(function (item, index) {
            var duration = Math.min(1600, Math.max(700, item.length * 2.2));
            var delay = Math.min(900, index * 7);

            item.el.style.transition =
              "stroke-dashoffset " +
              duration +
              "ms cubic-bezier(0.45, 0, 0.2, 1) " +
              delay +
              "ms";
            item.el.style.strokeDashoffset = "0";
          });
        }

        function showCouplerStatic() {
          prepared.forEach(function (item) {
            item.el.style.transition = "none";
            item.el.style.strokeDashoffset = "0";
          });
        }

        if (reduceMotion.matches) {
          showCouplerStatic();
          return;
        }

        if (!("IntersectionObserver" in window)) {
          drawCoupler();
          return;
        }

        var drawn = false;
        var observer = new IntersectionObserver(
          function (entries, obs) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting || drawn) return;
              drawn = true;
              drawCoupler();
              obs.unobserve(host);
            });
          },
          {
            threshold: 0.35,
            rootMargin: "0px 0px -8% 0px",
          }
        );

        observer.observe(host);
      })
      .catch(function () {
        var img = document.createElement("img");
        img.src = src;
        img.alt = host.getAttribute("aria-label") || "Coupler outline";
        host.appendChild(img);
        host.classList.add("is-ready");
      });
  }

})();
