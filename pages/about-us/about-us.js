/* About Us — coupler outline draw (same motion as home innovations). */

(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  initCouplerOutlineDraw();
  initCompaniesMarquee();

  function initCouplerOutlineDraw() {
    var hosts = document.querySelectorAll(".ethosCardIcon[data-coupler-src]");
    if (!hosts.length) return;

    var src = hosts[0].getAttribute("data-coupler-src");
    if (!src) return;

    fetch(src)
      .then(function (res) {
        if (!res.ok) throw new Error("Coupler SVG fetch failed");
        return res.text();
      })
      .then(function (markup) {
        Array.prototype.forEach.call(hosts, function (host, index) {
          host.innerHTML = markup;
          var svg = host.querySelector("svg");
          if (!svg) return;

          svg.setAttribute("role", "presentation");
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          if (!svg.getAttribute("viewBox")) {
            svg.setAttribute("viewBox", "0 0 220 178");
          }

          uniquifySvgIds(svg, "-c" + index);

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
            prepared.forEach(function (item, pathIndex) {
              var duration = Math.min(1600, Math.max(700, item.length * 2.2));
              var delay = Math.min(900, pathIndex * 7);

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
        });
      })
      .catch(function () {
        Array.prototype.forEach.call(hosts, function (host) {
          var img = document.createElement("img");
          img.src = src;
          img.alt = host.getAttribute("aria-label") || "Coupler outline";
          host.appendChild(img);
          host.classList.add("is-ready");
        });
      });
  }

  function initCompaniesMarquee() {
    var root = document.querySelector(".companiesMarquees");
    var source = root && root.querySelector(".companiesSource");
    if (!root || !source) return;

    var items = Array.prototype.slice.call(source.children);
    if (!items.length || reduceMotion.matches) return;

    function cloneGroup(hidden) {
      var group = document.createElement("ul");
      group.className = "companiesGroup";
      if (hidden) group.setAttribute("aria-hidden", "true");

      items.forEach(function (item) {
        var clone = item.cloneNode(true);
        if (hidden) {
          var img = clone.querySelector("img");
          if (img) img.alt = "";
        }
        group.appendChild(clone);
      });

      return group;
    }

    function makeMarquee(directionClass, hideWhole) {
      var marquee = document.createElement("div");
      marquee.className = "companiesMarquee " + directionClass;
      if (hideWhole) marquee.setAttribute("aria-hidden", "true");

      var track = document.createElement("div");
      track.className = "companiesTrack";
      track.appendChild(cloneGroup(hideWhole));
      track.appendChild(cloneGroup(true));
      marquee.appendChild(track);

      return marquee;
    }

    root.appendChild(makeMarquee("companiesMarqueeLtr", false));
    root.appendChild(makeMarquee("companiesMarqueeRtl", true));
    source.setAttribute("hidden", "");
    root.classList.add("companiesMarqueesAnimated");
  }

  function uniquifySvgIds(svg, suffix) {
    var nodes = svg.querySelectorAll("[id]");
    var ids = [];
    var i;

    for (i = 0; i < nodes.length; i++) {
      ids.push(nodes[i].getAttribute("id"));
    }

    ids.sort(function (a, b) {
      return b.length - a.length;
    });

    var html = svg.innerHTML;
    for (i = 0; i < ids.length; i++) {
      var oldId = ids[i];
      var newId = oldId + suffix;
      html = html.split("#" + oldId).join("#" + newId);
      html = html.split('id="' + oldId + '"').join('id="' + newId + '"');
    }
    svg.innerHTML = html;
  }
})();
