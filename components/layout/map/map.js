/* Map — network route animation for the KonNx distribution map SVG. */
(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  /* Soft-pause hooks filled in once the network loop is ready. Pausing stops
     new route draws without resetting pins — used while the accordion runs. */
  var mapPlayback = {
    pause: function () {},
    resume: function () {},
  };
  var mapAccordion = initMapAccordion();

  initMapNetworkMotion();

  /* ---- Compact region accordion (≤1024px) ----
     Ground-up: Web Animations API owns height. No CSS height transitions.
     Map SVG work is paused for the duration so iOS is not fighting two
     layout/paint storms at once. */
  function initMapAccordion() {
    var listeners = [];
    var api = {
      activeRegion: null,
      open: function () {},
      onChange: function (fn) {
        listeners.push(fn);
      },
    };

    var list = document.querySelector(".mapLocations");
    if (!list) return api;

    var items = Array.prototype.slice.call(
      list.querySelectorAll(".mapLocation[data-map-region]")
    );
    if (!items.length) return api;

    var DURATION = 350;
    var EASING = "ease";
    var animating = 0;
    var ready = false;

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
      onAnimEnd();
    }

    function snap(panel, open) {
      panel.style.height = open ? "auto" : "0px";
      panel.style.overflow = open ? "" : "hidden";
      panel.style.visibility = open ? "visible" : "hidden";
    }

    function onAnimStart() {
      if (animating === 0) mapPlayback.pause();
      animating += 1;
    }

    function onAnimEnd() {
      animating -= 1;
      if (animating <= 0) {
        animating = 0;
        mapPlayback.resume();
      }
    }

    function animatePanel(panel, open) {
      cancelAnim(panel);

      if (!ready || reduceMotion.matches || typeof panel.animate !== "function") {
        snap(panel, open);
        return;
      }

      onAnimStart();

      var from = panel.getBoundingClientRect().height;
      var to = open ? measureContentHeight(panel) : 0;

      panel.style.visibility = "visible";
      panel.style.overflow = "hidden";
      panel.style.height = from + "px";

      if (Math.round(from) === Math.round(to)) {
        snap(panel, open);
        onAnimEnd();
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
        onAnimEnd();
      };
    }

    function setOpen(regionId) {
      items.forEach(function (item) {
        var isOpen = item.getAttribute("data-map-region") === regionId;
        var wasOpen = item.classList.contains("is-open");
        var toggle = item.querySelector(".mapLocationTrigger");
        var panel = item.querySelector(".mapLocationPanel");

        item.classList.toggle("is-open", isOpen);
        if (toggle) toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        if (!panel) return;
        if (isOpen === wasOpen && ready) return;
        animatePanel(panel, isOpen);
      });

      api.activeRegion = regionId;

      /* Fire map highlight after the accordion has claimed this frame —
         running SVG work in the same turn as the height animation is what
         made taps feel locked up on iOS. */
      window.requestAnimationFrame(function () {
        listeners.forEach(function (fn) {
          fn(regionId);
        });
      });
    }

    items.forEach(function (item) {
      var regionId = item.getAttribute("data-map-region");
      var toggle = item.querySelector(".mapLocationTrigger");
      var panel = item.querySelector(".mapLocationPanel");
      if (!toggle || !panel) return;

      panel.style.height = "0px";
      panel.style.overflow = "hidden";
      panel.style.visibility = "hidden";

      toggle.addEventListener("click", function () {
        setOpen(api.activeRegion === regionId ? null : regionId);
      });
    });

    api.open = function (regionId) {
      if (api.activeRegion !== regionId) setOpen(regionId);
    };

    list.classList.add("is-accordion");
    setOpen(null);
    ready = true;

    return api;
  }

  function initMapNetworkMotion() {
    var canvas = document.querySelector(".mapCanvas");
    if (!canvas) return;

    var src = canvas.getAttribute("data-map-src");
    if (!src) return;

    fetch(src)
      .then(function (res) {
        if (!res.ok) throw new Error("Map SVG fetch failed");
        return res.text();
      })
      .then(function (markup) {
        canvas.innerHTML = markup;
        var svg = canvas.querySelector("svg");
        if (!svg) return;

        svg.setAttribute("role", "presentation");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        if (!svg.getAttribute("viewBox")) {
          svg.setAttribute("viewBox", "0 0 1576 844");
        }

        var network = prepareMapNetwork(svg);
        if (!network) return;

        initMapContactCards(canvas, network);

        if (reduceMotion.matches) {
          showMapNetworkStatic(network);
          canvas.classList.add("is-mapReady");
          return;
        }

        resetMapNetwork(network);
        canvas.classList.add("is-mapReady");

        var playing = false;
        var cancelled = false;
        var softPaused = false;
        var cycleToken = 0;
        var inView = false;

        function stopCycle() {
          cancelled = true;
          cycleToken += 1;
          playing = false;
        }

        function startCycle() {
          if (playing || softPaused || !inView) return;
          playing = true;
          cancelled = false;
          var token = ++cycleToken;
          runBusyMapNetwork(network, function () {
            return cancelled || softPaused || token !== cycleToken;
          }).then(function () {
            playing = false;
          });
        }

        mapPlayback.pause = function () {
          softPaused = true;
          cancelled = true;
          playing = false;
        };

        mapPlayback.resume = function () {
          softPaused = false;
          startCycle();
        };

        if (!("IntersectionObserver" in window)) {
          startCycle();
          return;
        }

        var mapObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                inView = true;
                startCycle();
              } else {
                inView = false;
                softPaused = false;
                stopCycle();
                resetMapNetwork(network);
              }
            });
          },
          {
            threshold: 0.35,
            rootMargin: "0px 0px -8% 0px",
          }
        );

        mapObserver.observe(canvas);
      })
      .catch(function () {
        var img = document.createElement("img");
        img.className = "mapCanvasFallback";
        img.src = src;
        img.alt = canvas.getAttribute("aria-label") || "Map";
        canvas.appendChild(img);
      });
  }

  function prepareMapNetwork(svg) {
    var strokePaths = Array.prototype.slice.call(
      svg.querySelectorAll('path[stroke="#FF6A14"], path[stroke="#ff6a14"]')
    );
    var fillPaths = Array.prototype.slice.call(
      svg.querySelectorAll(
        'path[fill="#FF6A14"], path[fill="#ff6a14"], path[fill="#FFAD7D"], path[fill="#ffad7d"]'
      )
    );

    if (!strokePaths.length || !fillPaths.length) return null;

    // Expand multi-stop composites into individual hops so every connection can fire
    var routeEls = [];
    strokePaths.forEach(function (path) {
      var segments = splitStrokeIntoHops(path);
      segments.forEach(function (seg) {
        seg.classList.add("mapRoute");
        routeEls.push(seg);
      });
    });

    var routes = [];
    routeEls.forEach(function (path) {
      var length = 0;
      try {
        length = path.getTotalLength();
      } catch (err) {
        return;
      }
      if (length < 1) return;

      var start = path.getPointAtLength(0);
      var end = path.getPointAtLength(length);
      routes.push({
        el: path,
        length: length,
        start: start,
        end: end,
        busy: false,
      });
    });

    var locations = [];

    fillPaths.forEach(function (path) {
      path.classList.add("mapPinPart");
      var box = path.getBBox();
      var cx = box.x + box.width / 2;
      var cy = box.y + box.height / 2;
      var match = null;
      var i;

      for (i = 0; i < locations.length; i++) {
        if (distance(locations[i].x, locations[i].y, cx, cy) < 18) {
          match = locations[i];
          break;
        }
      }

      if (!match) {
        match = {
          id: locations.length,
          x: cx,
          y: cy,
          parts: [],
        };
        locations.push(match);
      }

      match.parts.push(path);
      match.x = (match.x * (match.parts.length - 1) + cx) / match.parts.length;
      match.y = (match.y * (match.parts.length - 1) + cy) / match.parts.length;
    });

    var iconRects = Array.prototype.slice
      .call(svg.querySelectorAll("rect"))
      .filter(function (rect) {
        var width = parseFloat(rect.getAttribute("width") || "0");
        return width > 0 && width < 80;
      });

    iconRects.forEach(function (rect) {
      var box = rect.getBBox();
      var cx = box.x + box.width / 2;
      var cy = box.y + box.height / 2;
      var nearest = null;
      var nearestDist = Infinity;

      locations.forEach(function (loc) {
        var d = distance(loc.x, loc.y, cx, cy);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = loc;
        }
      });

      if (nearest && nearestDist < 70) {
        rect.classList.add("mapPinPart");
        nearest.parts.push(rect);
      }
    });

    routes.forEach(function (route) {
      route.from = nearestLocation(locations, route.start.x, route.start.y);
      route.to = nearestLocation(locations, route.end.x, route.end.y);
    });

    return {
      svg: svg,
      routes: routes,
      locations: locations,
    };
  }

  /* Split a multi-curve orange stroke into one path per hop. */
  function splitStrokeIntoHops(path) {
    var d = path.getAttribute("d") || "";
    var move = d.match(/^\s*M\s*([-\d.]+)[,\s]+([-\d.]+)/i);
    var curves = d.match(
      /C\s*[-\d.]+[,\s]+[-\d.]+[,\s]+[-\d.]+[,\s]+[-\d.]+[,\s]+[-\d.]+[,\s]+[-\d.]+/gi
    );

    if (!move || !curves || curves.length <= 1) {
      return [path];
    }

    var x = parseFloat(move[1]);
    var y = parseFloat(move[2]);
    var parent = path.parentNode;
    var ns = "http://www.w3.org/2000/svg";
    var hops = [];
    var i;

    for (i = 0; i < curves.length; i++) {
      var nums = curves[i]
        .replace(/^C/i, "")
        .trim()
        .split(/[,\s]+/)
        .map(parseFloat);
      if (nums.length < 6) continue;

      var seg = document.createElementNS(ns, "path");
      seg.setAttribute(
        "d",
        "M" +
          x +
          " " +
          y +
          "C" +
          nums[0] +
          " " +
          nums[1] +
          " " +
          nums[2] +
          " " +
          nums[3] +
          " " +
          nums[4] +
          " " +
          nums[5]
      );
      seg.setAttribute("stroke", path.getAttribute("stroke") || "#FF6A14");
      seg.setAttribute("fill", "none");
      seg.setAttribute(
        "stroke-miterlimit",
        path.getAttribute("stroke-miterlimit") || "1.5"
      );
      seg.setAttribute("stroke-linecap", "round");
      seg.setAttribute("stroke-linejoin", "round");
      parent.insertBefore(seg, path);

      hops.push(seg);
      x = nums[4];
      y = nums[5];
    }

    path.parentNode.removeChild(path);
    return hops.length ? hops : [path];
  }

  function nearestLocation(locations, x, y) {
    var best = locations[0];
    var bestDist = Infinity;
    locations.forEach(function (loc) {
      var d = distance(loc.x, loc.y, x, y);
      if (d < bestDist) {
        bestDist = d;
        best = loc;
      }
    });
    return best;
  }

  function distance(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function showMapNetworkStatic(network) {
    network.routes.forEach(function (route) {
      route.el.classList.add("is-visible");
      route.el.style.strokeDasharray = "none";
      route.el.style.strokeDashoffset = "0";
      route.el.style.opacity = "";
    });
    network.locations.forEach(function (loc) {
      loc.parts.forEach(function (part) {
        part.classList.add("is-visible");
      });
    });
  }

  function resetMapNetwork(network) {
    network.routes.forEach(function (route) {
      route.busy = false;
      route.el.classList.remove("is-visible", "is-drawing");
      route.el.style.transition = "none";
      route.el.style.opacity = "";
      route.el.style.strokeDasharray = String(route.length);
      route.el.style.strokeDashoffset = String(route.length);
    });
    network.locations.forEach(function (loc) {
      loc.activeDraws = 0;
      loc.receiving = false;
      loc.darkUntil = 0;
      loc.parts.forEach(function (part) {
        part.classList.remove("is-visible", "is-pulsing");
      });
    });
  }

  function wait(ms, isCancelled) {
    return new Promise(function (resolve) {
      var start = performance.now();
      function tick(now) {
        if (isCancelled()) {
          resolve(false);
          return;
        }
        if (now - start >= ms) {
          resolve(true);
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function hideLocation(loc) {
    loc.parts.forEach(function (part) {
      part.classList.remove("is-pulsing");
      part.classList.remove("is-visible");
    });
    // Mandatory dark gap so busy hubs can actually disappear
    loc.darkUntil = performance.now() + 650;
    loc.receiving = false;
  }

  function beginOrigin(loc) {
    loc.activeDraws = (loc.activeDraws || 0) + 1;
    loc.parts.forEach(function (part) {
      part.classList.add("is-visible");
    });
  }

  function endOrigin(loc, isCancelled) {
    loc.activeDraws = Math.max(0, (loc.activeDraws || 0) - 1);
    wait(200, isCancelled).then(function (ok) {
      if (!ok) return;
      if ((loc.activeDraws || 0) > 0) return;
      if (loc.receiving) return;
      hideLocation(loc);
    });
  }

  /* Receive only: one visible window, no extensions (lets hubs fade). */
  function pulseLocation(loc, isCancelled) {
    if (loc.receiving) return;
    if (loc.darkUntil && performance.now() < loc.darkUntil) return;

    loc.receiving = true;
    loc.parts.forEach(function (part) {
      part.classList.add("is-visible");
      part.classList.remove("is-pulsing");
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (isCancelled() || !loc.receiving) return;
        loc.parts.forEach(function (part) {
          if (part.classList.contains("is-visible")) {
            part.classList.add("is-pulsing");
          }
        });
      });
    });

    wait(900, isCancelled).then(function (ok) {
      if (!ok) return;
      loc.parts.forEach(function (part) {
        part.classList.remove("is-pulsing");
      });
      return wait(300, isCancelled);
    }).then(function (ok) {
      if (!ok) return;
      loc.receiving = false;
      if ((loc.activeDraws || 0) > 0) return;
      hideLocation(loc);
    });
  }

  function drawRoute(route, reverse, isCancelled) {
    var el = route.el;
    var len = route.length;
    var duration = Math.min(2600, Math.max(1300, len * 1.85));

    el.style.opacity = "";
    el.classList.add("is-visible", "is-drawing");
    el.style.transition = "none";
    el.style.strokeDasharray = String(len);
    el.style.strokeDashoffset = reverse ? String(-len) : String(len);

    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (isCancelled()) {
            el.style.transition = "";
            el.classList.remove("is-drawing");
            resolve(false);
            return;
          }
          el.style.transition =
            "stroke-dashoffset " + duration + "ms cubic-bezier(0.45, 0, 0.2, 1)";
          el.style.strokeDashoffset = "0";

          var done = false;
          function finish(ok) {
            if (done) return;
            done = true;
            el.removeEventListener("transitionend", onEnd);
            // Restore CSS opacity transition so the trail ease can run
            el.style.transition = "";
            el.classList.remove("is-drawing");
            resolve(ok);
          }

          function onEnd(event) {
            if (event.propertyName !== "stroke-dashoffset") return;
            finish(true);
          }

          el.addEventListener("transitionend", onEnd);
          wait(duration + 80, isCancelled).then(function (ok) {
            finish(ok);
          });
        });
      });
    });
  }

  function fadeOutRoute(route, isCancelled) {
    var el = route.el;
    el.classList.remove("is-drawing");
    el.style.transition = "opacity 0.55s ease";
    el.style.opacity = "0";

    return wait(550, isCancelled).then(function (ok) {
      el.classList.remove("is-visible");
      el.style.transition = "none";
      el.style.opacity = "";
      el.style.strokeDasharray = String(route.length);
      el.style.strokeDashoffset = String(route.length);
      return ok;
    });
  }

  /* Continuous busy network: several hops drawing at once, no idle gaps. */
  function runBusyMapNetwork(network, isCancelled) {
    var workers = 4;
    var i;
    var jobs = [];

    for (i = 0; i < workers; i++) {
      jobs.push(runRouteWorker(network, i * 110, isCancelled));
    }

    return Promise.all(jobs);
  }

  function pickIdleRoute(network) {
    var idle = network.routes.filter(function (route) {
      return !route.busy;
    });
    if (!idle.length) return null;
    return idle[Math.floor(Math.random() * idle.length)];
  }

  function scheduleRouteFade(route, generation, isCancelled) {
    wait(520 + Math.random() * 380, isCancelled).then(function (held) {
      if (!held) return;
      if (route.generation !== generation || route.busy) return;
      fadeOutRoute(route, isCancelled);
    });
  }

  function runRouteWorker(network, initialDelay, isCancelled) {
    function loop() {
      if (isCancelled()) return Promise.resolve(false);

      return wait(initialDelay, isCancelled).then(function (ok) {
        initialDelay = 40 + Math.random() * 90;
        if (!ok) return false;

        var route = pickIdleRoute(network);
        if (!route) {
          return wait(80, isCancelled).then(function (waited) {
            if (!waited) return false;
            return loop();
          });
        }

        route.busy = true;
        route.generation = (route.generation || 0) + 1;
        var generation = route.generation;
        var reverse = Math.random() < 0.5;
        var origin = reverse ? route.to : route.from;
        var destination = reverse ? route.from : route.to;

        beginOrigin(origin);

        return drawRoute(route, reverse, isCancelled).then(function (drawn) {
          route.busy = false;
          // Release sender when the draw finishes (not when the line fades)
          endOrigin(origin, isCancelled);

          if (!drawn) return false;

          pulseLocation(destination, isCancelled);
          scheduleRouteFade(route, generation, isCancelled);

          return loop();
        });
      });
    }

    return loop();
  }

  /* ---- Continent highlight + desktop contact cards ----
     Desktop (≥1024px): hover drives the outline and cursor card.
     Compact (≤1024px): taps and the accordion drive the outline. */

  var MAP_VB_W = 1576;
  var MAP_VB_H = 844;

  var MAP_REGION_CENTROIDS = [
    { id: "northAmerica", x: 229, y: 338 },
    { id: "southAmerica", x: 445, y: 696 },
    { id: "europe", x: 731, y: 257 },
    { id: "africa", x: 845, y: 679 },
    { id: "australiaAsia", x: 1371, y: 668 },
  ];

  /* Hit + clip polygons in map viewBox space. Africa / Asia split through
     the Red Sea so the land silhouette outline does not cut a fake coast. */
  var MAP_CONTINENT_SHAPES = [
    {
      id: "northAmerica",
      points: "0,0 560,0 545,290 430,500 200,560 0,430",
    },
    {
      id: "southAmerica",
      points: "155,500 430,500 600,560 610,844 250,844 145,690",
    },
    {
      id: "europe",
      points: "608,78 898,78 938,258 848,348 668,348 608,228",
    },
    {
      id: "africa",
      points: "648,348 848,348 980,390 1008,520 1058,818 748,838 648,618",
    },
    {
      id: "australiaAsia",
      points: "898,36 1568,36 1568,828 1098,828 1008,520 980,390 938,258 898,78",
    },
  ];

  var MAP_REGION_CONTENT = {
    africa: {
      title: "Africa",
      blocks: [
        {
          subhead: "Sales Enquiries",
          lines: [
            {
              text: "Tel: ",
              link: { href: "tel:+27114962431", label: "+27 11 496 2431" },
            },
            {
              text: "Email: ",
              link: { href: "mailto:sales@konnx.co.za", label: "sales@konnx.co.za" },
            },
          ],
        },
      ],
    },
    europe: {
      title: "UK & Europe",
      blocks: [
        {
          subhead: "Sales Enquiries",
          lines: [
            {
              text: "Tel: ",
              link: { href: "tel:+447432217680", label: "+44 743 221 7680" },
            },
            {
              text: "Email: ",
              link: { href: "mailto:sales@konnx.co.uk", label: "sales@konnx.co.uk" },
            },
          ],
        },
      ],
    },
    northAmerica: {
      title: "North America",
      blocks: [
        {
          subhead: "Sales Enquiries",
          lines: [
            {
              text: "Tel: ",
              link: { href: "tel:+17206104932", label: "+1 720 610 4932" },
            },
            {
              text: "Email: ",
              link: { href: "mailto:sales@konnx.net", label: "sales@konnx.net" },
            },
          ],
        },
      ],
    },
    southAmerica: {
      title: "South America",
      blocks: [
        {
          subhead: "Sales Enquiries",
          lines: [
            {
              text: "Tel: ",
              link: { href: "tel:+51998881503", label: "+51 998 881 503" },
            },
            {
              text: "Email: ",
              link: {
                href: "mailto:sergio.rodriguez@konnx.net",
                label: "sergio.rodriguez@konnx.net",
              },
            },
          ],
        },
      ],
    },
    australiaAsia: {
      title: "Australia & Asia",
      blocks: [
        {
          subhead: "Sales Enquiries",
          lines: [
            {
              text: "Tel: ",
              link: { href: "tel:+61749784000", label: "+61 7 4978 4000" },
            },
            {
              text: "Email: ",
              link: {
                href: "mailto:sales@ausproof.com.au",
                label: "sales@ausproof.com.au",
              },
            },
          ],
        },
      ],
    },
  };

  function parsePolygonPoints(pointsStr) {
    return String(pointsStr)
      .trim()
      .split(/\s+/)
      .map(function (pair) {
        var xy = pair.split(",");
        return { x: parseFloat(xy[0]), y: parseFloat(xy[1]) };
      })
      .filter(function (pt) {
        return isFinite(pt.x) && isFinite(pt.y);
      });
  }

  function pointInPolygon(x, y, pointsStr) {
    var pts = parsePolygonPoints(pointsStr);
    var inside = false;
    var i;
    var j;

    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var yi = pts[i].y;
      var yj = pts[j].y;
      var xi = pts[i].x;
      var xj = pts[j].x;
      var intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  function regionForPoint(x, y) {
    var i;
    var best = MAP_REGION_CENTROIDS[0];
    var bestDist = Infinity;

    for (i = 0; i < MAP_CONTINENT_SHAPES.length; i++) {
      if (pointInPolygon(x, y, MAP_CONTINENT_SHAPES[i].points)) {
        return MAP_CONTINENT_SHAPES[i].id;
      }
    }

    MAP_REGION_CENTROIDS.forEach(function (centroid) {
      var d = distance(centroid.x, centroid.y, x, y);
      if (d < bestDist) {
        bestDist = d;
        best = centroid;
      }
    });

    return best.id;
  }

  function initMapContactCards(canvas, network) {
    var wrap = canvas.closest(".mapCanvasWrap");
    var card = document.getElementById("mapCard");
    var svg = network && network.svg;
    if (!wrap || !card || !svg) return;

    var body = card.querySelector(".mapCardBody");
    if (!body) return;

    var compactMq = window.matchMedia("(max-width: 1024px)");
    var ns = "http://www.w3.org/2000/svg";
    var hitLayer = null;
    var outlineLayer = null;
    var outlineGroups = {};
    var highlightRegion = null;
    var outlineAnim = 0;
    var activeRegion = null;
    var hideTimer = null;
    var overContinent = false;
    var overCard = false;
    var lastPointer = null;
    var cardSide = 1;
    var posFrame = 0;
    var centroidById = {};

    MAP_REGION_CENTROIDS.forEach(function (centroid) {
      centroidById[centroid.id] = centroid;
    });

    network.locations.forEach(function (loc) {
      loc.regionId = regionForPoint(loc.x, loc.y);
    });

    function buildCardHtml(regionId) {
      var data = MAP_REGION_CONTENT[regionId];
      if (!data) return "";

      var html = '<p class="mapCardRegion">' + escapeHtml(data.title) + "</p>";

      data.blocks.forEach(function (block) {
        html += '<div class="mapCardBlock">';
        if (block.subhead) {
          html += '<p class="mapCardSubhead">' + escapeHtml(block.subhead) + "</p>";
        }
        block.lines.forEach(function (line) {
          html += '<p class="mapCardLine">';
          if (line.text) html += escapeHtml(line.text);
          if (line.link) {
            html +=
              '<a href="' +
              escapeAttr(line.link.href) +
              '"' +
              (line.link.external
                ? ' target="_blank" rel="noopener noreferrer"'
                : "") +
              ">" +
              escapeHtml(line.link.label) +
              "</a>";
          }
          html += "</p>";
        });
        html += "</div>";
      });

      return html;
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/'/g, "&#39;");
    }

    function placeCard(cursorX, cursorY) {
      var wrapRect = wrap.getBoundingClientRect();
      var pad = 12;
      var gap = 18;
      var cardW = card.offsetWidth || 260;
      var cardH = card.offsetHeight || 150;
      var maxLeft = wrapRect.width - cardW - pad;
      var fitsRight = cursorX + gap + cardW <= wrapRect.width - pad;
      var fitsLeft = cursorX - gap - cardW >= pad;

      if (cardSide === 1 && !fitsRight && fitsLeft) {
        cardSide = -1;
      } else if (cardSide === -1 && !fitsLeft && fitsRight) {
        cardSide = 1;
      } else if (fitsRight && !fitsLeft) {
        cardSide = 1;
      } else if (fitsLeft && !fitsRight) {
        cardSide = -1;
      }

      var left = cardSide === 1 ? cursorX + gap : cursorX - cardW - gap;
      var top = cursorY - cardH - gap;

      if (top < pad) {
        top = cursorY + gap;
      }
      if (top + cardH > wrapRect.height - pad) {
        top = wrapRect.height - cardH - pad;
      }

      left = Math.max(pad, Math.min(left, maxLeft));
      top = Math.max(pad, Math.min(top, wrapRect.height - cardH - pad));

      card.style.transform =
        "translate3d(" + Math.round(left) + "px, " + Math.round(top) + "px, 0)";
    }

    function positionCardAtPointer(event) {
      var wrapRect = wrap.getBoundingClientRect();
      lastPointer = {
        x: event.clientX - wrapRect.left,
        y: event.clientY - wrapRect.top,
      };
      if (posFrame) return;
      posFrame = window.requestAnimationFrame(function () {
        posFrame = 0;
        if (!lastPointer) return;
        placeCard(lastPointer.x, lastPointer.y);
      });
    }

    function positionCardAtCentroid(regionId) {
      var wrapRect = wrap.getBoundingClientRect();
      var svgRect = svg.getBoundingClientRect();
      var centroid = centroidById[regionId];
      var x =
        ((centroid ? centroid.x : MAP_VB_W / 2) / MAP_VB_W) * svgRect.width +
        (svgRect.left - wrapRect.left);
      var y =
        ((centroid ? centroid.y : MAP_VB_H / 2) / MAP_VB_H) * svgRect.height +
        (svgRect.top - wrapRect.top);
      lastPointer = { x: x, y: y };
      placeCard(x, y);
    }

    /* Stroke radius is in viewBox units, so scale it to keep a ~1.5px line
       whether the map renders at 1100px or 340px wide. */
    function outlineRadius() {
      var width = svg.getBoundingClientRect().width;
      if (!width) return 2.25;
      var radius = 1.5 / (width / MAP_VB_W);
      return Math.max(2, Math.min(radius, 7));
    }

    /* Ring width = radius. The stroke is centred on the coast and painted
       under the land fill, so a 2 × radius stroke leaves a radius-wide ring. */
    function setOutlineRadius(radius) {
      if (!outlineLayer) return;
      outlineLayer.setAttribute("stroke-width", String(radius * 2));
    }

    function animateOutlineRadius(fromRadius, toRadius) {
      if (!outlineLayer) return;
      var token = ++outlineAnim;

      if (reduceMotion.matches) {
        setOutlineRadius(toRadius);
        return;
      }

      var start = performance.now();
      var duration = 720;
      setOutlineRadius(fromRadius);

      function tick(now) {
        if (token !== outlineAnim) return;
        var t = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - t, 5);
        setOutlineRadius(fromRadius + (toRadius - fromRadius) * eased);
        if (t < 1) requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    }

    function setActiveContinent(regionId) {
      var wasActive = Boolean(highlightRegion);
      var compact = compactMq.matches;
      highlightRegion = regionId || null;

      Object.keys(outlineGroups).forEach(function (id) {
        outlineGroups[id].classList.toggle("is-active", id === regionId);
      });

      /* Compact: set stroke width once — never animate it alongside the accordion.
         Desktop: keep the soft draw-in on first hover only. */
      if (regionId) {
        var radius = outlineRadius();
        if (!wasActive && !compact) {
          animateOutlineRadius(radius * 0.35, radius);
        } else {
          outlineAnim += 1;
          setOutlineRadius(radius);
        }
      }

      network.locations.forEach(function (loc) {
        loc.parts.forEach(function (part) {
          part.classList.toggle(
            "is-regionHover",
            Boolean(regionId) && loc.regionId === regionId
          );
        });
      });

      canvas.classList.toggle("is-continentHover", Boolean(regionId));
    }

    function showCard(regionId, event) {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }

      var regionChanged = activeRegion !== regionId;
      if (regionChanged) {
        body.innerHTML = buildCardHtml(regionId);
        activeRegion = regionId;
        setActiveContinent(regionId);
      }

      card.hidden = false;
      card.setAttribute("aria-hidden", "false");

      if (event) {
        positionCardAtPointer(event);
      } else if (lastPointer) {
        placeCard(lastPointer.x, lastPointer.y);
      } else {
        positionCardAtCentroid(regionId);
      }

      requestAnimationFrame(function () {
        card.classList.add("is-open");
        if (event) {
          positionCardAtPointer(event);
        } else if (lastPointer) {
          placeCard(lastPointer.x, lastPointer.y);
        }
      });
    }

    function hideCard(immediate) {
      function close() {
        card.classList.remove("is-open");
        card.setAttribute("aria-hidden", "true");
        setActiveContinent(null);
        activeRegion = null;
        hideTimer = null;

        if (immediate) {
          card.hidden = true;
          return;
        }

        window.setTimeout(function () {
          if (card.classList.contains("is-open")) return;
          card.hidden = true;
        }, 220);
      }

      if (immediate) {
        if (hideTimer) {
          window.clearTimeout(hideTimer);
          hideTimer = null;
        }
        close();
        return;
      }

      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(function () {
        if (overContinent || overCard) return;
        close();
      }, 180);
    }

    function scheduleHide() {
      hideCard(false);
    }

    function clearContinents() {
      if (outlineLayer && outlineLayer.parentNode) {
        outlineLayer.parentNode.removeChild(outlineLayer);
      }
      if (hitLayer && hitLayer.parentNode) {
        hitLayer.parentNode.removeChild(hitLayer);
      }
      outlineLayer = null;
      hitLayer = null;
      outlineGroups = {};
      highlightRegion = null;
      Array.prototype.forEach.call(
        svg.querySelectorAll("[id^='mapClip-']"),
        function (el) {
          if (el.parentNode) el.parentNode.removeChild(el);
        }
      );
      hideCard(true);
    }

    function bindContinent(hit, regionId) {
      function activate(event) {
        if (compactMq.matches) return;
        overContinent = true;
        showCard(regionId, event.type === "focus" ? null : event);
      }

      function track(event) {
        if (compactMq.matches) return;
        overContinent = true;
        if (activeRegion !== regionId) {
          showCard(regionId, event);
        } else {
          positionCardAtPointer(event);
        }
      }

      function deactivate() {
        if (compactMq.matches) return;
        overContinent = false;
        scheduleHide();
      }

      function select() {
        if (!compactMq.matches) return;
        mapAccordion.open(regionId);
      }

      hit.addEventListener("mouseenter", activate);
      hit.addEventListener("mousemove", track);
      hit.addEventListener("mouseleave", deactivate);
      hit.addEventListener("focus", activate);
      hit.addEventListener("blur", deactivate);
      hit.addEventListener("click", select);
    }

    function buildContinents() {
      clearContinents();
      lastPointer = null;
      cardSide = 1;
      var compact = compactMq.matches;

      var land = svg.querySelector("path");
      if (!land) return;
      if (!land.id) land.id = "mapLand";
      var landRef = "#" + land.id;

      var defs = svg.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS(ns, "defs");
        svg.insertBefore(defs, svg.firstChild);
      }

      outlineLayer = document.createElementNS(ns, "g");
      outlineLayer.setAttribute("class", "mapContinentOutlineLayer");
      setOutlineRadius(outlineRadius());

      hitLayer = document.createElementNS(ns, "g");
      hitLayer.setAttribute("class", "mapContinentLayer");

      MAP_CONTINENT_SHAPES.forEach(function (shape) {
        if (!MAP_REGION_CONTENT[shape.id]) return;

        var clip = document.createElementNS(ns, "clipPath");
        clip.setAttribute("id", "mapClip-" + shape.id);
        clip.setAttribute("clipPathUnits", "userSpaceOnUse");
        var clipPoly = document.createElementNS(ns, "polygon");
        clipPoly.setAttribute("points", shape.points);
        clip.appendChild(clipPoly);
        defs.appendChild(clip);

        // One clipped group per region so switching regions crossfades
        var group = document.createElementNS(ns, "g");
        group.setAttribute("class", "mapContinentOutline");
        group.setAttribute("clip-path", "url(#mapClip-" + shape.id + ")");

        // Reuses the land path instead of cloning its 170KB of path data per region
        var stroke = document.createElementNS(ns, "use");
        stroke.setAttribute("class", "mapContinentStroke");
        stroke.setAttribute("href", landRef);
        stroke.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", landRef);

        group.appendChild(stroke);
        outlineLayer.appendChild(group);
        outlineGroups[shape.id] = group;

        var hit = document.createElementNS(ns, "polygon");
        hit.setAttribute("class", "mapContinentHit");
        hit.setAttribute("data-map-region", shape.id);
        hit.setAttribute("points", shape.points);

        // On compact screens the accordion is the keyboard / screen reader UI
        if (compact) {
          hit.setAttribute("aria-hidden", "true");
        } else {
          hit.setAttribute("tabindex", "0");
          hit.setAttribute("role", "button");
          hit.setAttribute(
            "aria-label",
            MAP_REGION_CONTENT[shape.id].title + " contacts"
          );
        }

        bindContinent(hit, shape.id);
        hitLayer.appendChild(hit);
      });

      var landParent = land.parentNode || svg;
      var paintStart = landParent.querySelector(".mapRoute, .mapPinPart");
      if (paintStart && paintStart.parentNode === landParent) {
        landParent.insertBefore(outlineLayer, paintStart);
      } else if (land.nextSibling && land.nextSibling.parentNode === landParent) {
        landParent.insertBefore(outlineLayer, land.nextSibling);
      } else {
        landParent.appendChild(outlineLayer);
      }
      svg.appendChild(hitLayer);
    }

    card.addEventListener("mouseenter", function () {
      overCard = true;
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    });
    card.addEventListener("mouseleave", function () {
      overCard = false;
      scheduleHide();
    });

    function syncAccordionHighlight() {
      if (!compactMq.matches) return;
      setActiveContinent(mapAccordion.activeRegion);
    }

    mapAccordion.onChange(function (regionId) {
      if (!compactMq.matches) return;
      setActiveContinent(regionId);
    });

    buildContinents();
    syncAccordionHighlight();

    function onViewportChange() {
      buildContinents();
      syncAccordionHighlight();
    }

    if (typeof compactMq.addEventListener === "function") {
      compactMq.addEventListener("change", onViewportChange);
    } else if (typeof compactMq.addListener === "function") {
      compactMq.addListener(onViewportChange);
    }
  }
})();
