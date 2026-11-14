/* 3D product viewer — Google <model-viewer>
   Markup skeleton: ./product-template.html (3D viewer variant).
   The library is a static <script type="module"> in the page <head>, and the
   GLB + meshopt decoder are preloaded there, so everything downloads in
   parallel with the HTML. This file only configures the element once the
   library has defined it. The GLB `src` is set here, after the decoder is
   registered, never in markup. Rendering is on demand (no auto-rotate).
   Also wires the control column: zoom, reset, hotspot toggle, and the AR
   button (touch devices that support AR only). */
(function () {
  var root = document.querySelector("[data-product-viewer]");
  if (!root) return;

  var viewer = root.querySelector("model-viewer");
  var fallback = root.querySelector(".productViewerFallback");
  var rotateHint = root.querySelector(".productViewerRotate");
  var controls = root.querySelector(".productViewerControls");
  var modelSrc = root.getAttribute("data-model-src");
  var decoderSrc =
    root.getAttribute("data-meshopt-decoder") ||
    "/assets/js/vendor/meshopt-decoder.js";
  if (!viewer || !modelSrc) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var LOAD_TIMEOUT_MS = 20000;
  var COMPACT_RADIUS = "82%";
  var DESKTOP_RADIUS = "112%"; // halfway between the markup's 100% and one full zoom step (125%)
  var FIT = 0.88; // most of the box the model may fill at any angle (measured on its bounding box)
  var loadTimer = null;

  // Static image (kept hidden, and never downloaded) only if 3D cannot run.
  function fail() {
    if (loadTimer) window.clearTimeout(loadTimer);
    root.classList.add("is-failed");
    if (fallback) fallback.hidden = false;
  }

  // Undo fail() if the model turns out to render after all.
  function recover() {
    root.classList.remove("is-failed");
    if (fallback) fallback.hidden = true;
  }

  function hasWebGL() {
    try {
      var canvas = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl"))
      );
    } catch (error) {
      return false;
    }
  }

  if (!hasWebGL() || !window.customElements) {
    fail();
    return;
  }

  // First touch reveals the controls and retires the rotate hint. Once done,
  // the listeners that report it are removed so dragging costs nothing extra.
  var touched = false;

  function onUserCamera(event) {
    if (event.detail && event.detail.source === "user-interaction") markTouched();
  }

  function markTouched() {
    if (touched) return;
    touched = true;
    root.classList.add("is-touched");
    viewer.removeEventListener("camera-change", onUserCamera);
    viewer.removeEventListener("pointerdown", markTouched);
  }

  // Own zoom step (model-viewer's zoom() is lopsided in and out). The orbit
  // limits on the element still clamp the result.
  var ZOOM_STEP = 0.8;

  function zoomBy(direction) {
    var orbit = viewer.getCameraOrbit();
    var factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    viewer.cameraOrbit =
      orbit.theta + "rad " + orbit.phi + "rad " + orbit.radius * factor + "m";
  }

  function resetView(initialOrbit, initialTarget) {
    viewer.cameraOrbit = initialOrbit;
    viewer.cameraTarget = initialTarget;
    viewer.fieldOfView = "auto";
    if (reduceMotion.matches) viewer.jumpCameraToGoal();
  }

  // Scroll hijacking fix: a plain mouse-wheel or two-finger scroll over the
  // viewer scrolls the page. Zoom needs Ctrl/Cmd + wheel (which is also how a
  // trackpad pinch arrives) or the zoom buttons. Touch uses
  // touch-action: pan-y, so a vertical swipe scrolls and pinch zooms.
  function guardWheel() {
    viewer.addEventListener(
      "wheel",
      function (event) {
        if (!event.ctrlKey && !event.metaKey) event.stopImmediatePropagation();
      },
      { capture: true, passive: true }
    );
  }

  // The glass rotate hint ignores the pointer so drags reach the model; it
  // still grows slightly when the pointer is over it, like a real button.
  function trackHintHover() {
    if (!rotateHint) return;
    root.addEventListener("pointermove", function (event) {
      // Mouse only, and only while the hint is still showing: touch drags
      // fire this constantly and measuring layout each time is wasted work.
      if (touched || (event.pointerType && event.pointerType !== "mouse")) return;
      var rect = rotateHint.getBoundingClientRect();
      var dx = event.clientX - (rect.left + rect.width / 2);
      var dy = event.clientY - (rect.top + rect.height / 2);
      rotateHint.classList.toggle(
        "is-hover",
        dx * dx + dy * dy <= (rect.width * rect.width) / 4
      );
    });
    root.addEventListener("pointerleave", function () {
      rotateHint.classList.remove("is-hover");
    });
  }

  // Developer helper for placing hotspots: open the page with
  // ?pickHotspot and click the model to log data-position / data-normal.
  function enableHotspotPicker() {
    if (window.location.search.indexOf("pickHotspot") === -1) return;
    viewer.addEventListener("click", function (event) {
      var hit = viewer.positionAndNormalFromPoint(event.clientX, event.clientY);
      if (!hit) return;
      var p = hit.position;
      var n = hit.normal;
      console.log(
        'data-position="' + p.toString() + '" data-normal="' + n.toString() + '"'
      );
    });
  }

  // Hotspot toggle: dots + labels are hidden by default. The button is
  // removed when the page has no hotspots. model-viewer ray-casts every
  // hotspot against the whole mesh on every frame (to fade the ones facing
  // away), so while they are off the buttons are taken out of the element
  // altogether and cost nothing; they go back in when the toggle is on.
  function setupHotspots() {
    var button = root.querySelector("[data-viewer-hotspots]");
    if (!button) return;
    var hotspots = Array.prototype.slice.call(
      viewer.querySelectorAll('[slot^="hotspot-"]')
    );
    if (!hotspots.length) {
      button.hidden = true;
      return;
    }

    var detachTimer = null;

    function detach() {
      hotspots.forEach(function (hotspot) {
        if (hotspot.parentNode === viewer) viewer.removeChild(hotspot);
      });
    }

    detach();

    button.addEventListener("click", function () {
      var on = !root.classList.contains("is-hotspotsOn");
      button.setAttribute("aria-pressed", on ? "true" : "false");
      window.clearTimeout(detachTimer);
      if (on) {
        hotspots.forEach(function (hotspot) {
          if (!hotspot.parentNode) viewer.appendChild(hotspot);
        });
        // Next frame, so the fade-in has a hidden state to start from.
        window.requestAnimationFrame(function () {
          root.classList.add("is-hotspotsOn");
        });
      } else {
        root.classList.remove("is-hotspotsOn");
        detachTimer = window.setTimeout(detach, 350); // after the fade-out
      }
    });
  }

  // "View in your space": model-viewer does the AR work (WebXR on Android,
  // Quick Look on iOS, with the USDZ built in the browser). The button stays
  // hidden unless the library reports the device can really start a session
  // AND the primary input is touch, so it never shows on desktop. The session
  // only starts from this tap (a user gesture), the browser or OS asks for
  // camera permission itself, and nothing leaves the site: same-origin model,
  // no Scene Viewer / Google hand-off (it cannot read meshopt GLBs anyway).
  function setupAr() {
    var button = root.querySelector("[data-viewer-ar]");
    if (!button) return;

    var touchFirst = window.matchMedia("(hover: none) and (pointer: coarse)");
    var attempts = 0;

    function check() {
      if (viewer.canActivateAR && touchFirst.matches) {
        button.hidden = false;
        return;
      }
      // model-viewer works out AR support asynchronously after load.
      attempts += 1;
      if (attempts < 20) window.setTimeout(check, 250);
    }

    // In AR the model is placed with its +z end towards the visitor, which
    // shows this long coupler end-on. A 90 degree yaw (orientation is
    // "roll pitch yaw") turns it side-on so the whole body is visible. It is
    // applied only for the AR launch and put back afterwards, so the on-page
    // viewer is untouched. WebXR keeps the yaw for the session (model-viewer
    // re-measures on change); Quick Look's USDZ is built from the model as
    // it is at launch.
    var AR_ORIENTATION = "0deg 0deg 90deg";
    var pageOrientation = null;

    function restoreOrientation() {
      if (pageOrientation === null) return;
      viewer.orientation = pageOrientation;
      pageOrientation = null;
    }

    viewer.addEventListener("ar-status", function (event) {
      var status = event.detail && event.detail.status;
      if (status === "not-presenting" || status === "failed") {
        restoreOrientation();
      }
    });

    button.addEventListener("click", function () {
      if (!viewer.canActivateAR || pageOrientation !== null) return;
      pageOrientation = viewer.orientation || "0deg 0deg 0deg";
      viewer.orientation = AR_ORIENTATION;

      viewer.updateComplete
        .then(function () {
          return viewer.activateAR();
        })
        .then(function () {
          // Quick Look never reports a session, and its file is already built
          // by now. Give WebXR time to flag its session before deciding.
          window.setTimeout(function () {
            if (viewer.getAttribute("ar-status") !== "session-started") {
              restoreOrientation();
            }
          }, 1500);
        })
        .catch(restoreOrientation);
    });

    if (touchFirst.matches) viewer.addEventListener("load", check, { once: true });
  }

  function bind() {
    var initialOrbit = viewer.getAttribute("camera-orbit") || "auto auto auto";
    var initialTarget = viewer.getAttribute("camera-target") || "auto auto auto";

    // Small screens give the model less room, so start a little closer in;
    // desktop has plenty, so it starts a little further out. The reset
    // button returns to the same view.
    function startOrbit(orbit) {
      var radius = null;
      if (window.matchMedia("(max-width: 768px)").matches) {
        radius = COMPACT_RADIUS;
      } else if (window.matchMedia("(min-width: 1025px)").matches) {
        radius = DESKTOP_RADIUS;
      }
      var parts = orbit.split(" ");
      if (radius && parts.length === 3) {
        parts[2] = radius;
        return parts.join(" ");
      }
      return orbit;
    }

    var markupOrbit = initialOrbit;
    initialOrbit = startOrbit(initialOrbit);
    viewer.cameraOrbit = initialOrbit;

    // Fit to the box. The camera has a fixed 30deg vertical field of view, so
    // how much of the box's width the model takes depends on the box's aspect
    // ratio: a tall, narrow box (iPad Pro landscape, phones) crops the long
    // coupler when it is turned, however it was framed for a wide box. This
    // turns the model's bounding box through a full circle, projects its
    // corners the way the camera would, and finds the camera distance at which
    // the biggest it ever looks (width or height) is FIT of the box. It only ever moves the
    // camera out from the size-based start, never in. It re-runs on resize and
    // rotation, and the reset button follows it.
    var baseOrbit = initialOrbit;
    var basePhi = 0;
    var modelReady = false;

    function neededRadius(aspect) {
      var size = viewer.getDimensions();
      var centre = viewer.getBoundingBoxCenter();
      var target = viewer.getCameraTarget();
      var tanHalf = Math.tan((viewer.getFieldOfView() * Math.PI) / 360);
      var limitX = FIT * tanHalf * aspect;
      var limitY = FIT * tanHalf;
      var sinPhi = Math.sin(basePhi);
      var cosPhi = Math.cos(basePhi);
      var worst = 0;

      for (var deg = 0; deg < 360; deg += 6) {
        var theta = (deg * Math.PI) / 180;
        var sinT = Math.sin(theta);
        var cosT = Math.cos(theta);
        for (var corner = 0; corner < 8; corner++) {
          var px = centre.x - target.x + (corner & 1 ? 1 : -1) * (size.x / 2);
          var py = centre.y - target.y + (corner & 2 ? 1 : -1) * (size.y / 2);
          var pz = centre.z - target.z + (corner & 4 ? 1 : -1) * (size.z / 2);
          var across = Math.abs(px * cosT - pz * sinT);
          var towards = px * sinPhi * sinT + py * cosPhi + pz * sinPhi * cosT;
          var up = Math.abs(-px * cosPhi * sinT + py * sinPhi - pz * cosPhi * cosT);
          var distance = towards + Math.max(across / limitX, up / limitY);
          if (distance > worst) worst = distance;
        }
      }
      return worst;
    }

    function fitOrbit() {
      var width = viewer.clientWidth;
      var height = viewer.clientHeight;
      if (!width || !height || !modelReady) return;

      // The size-based start (see above), re-read so a rotation or resize
      // that crosses a breakpoint is handled too.
      baseOrbit = startOrbit(markupOrbit);

      // What 100% means depends on the box, so ask again every time. The
      // camera is put back before anything is drawn, so nothing flickers.
      var current = viewer.getCameraOrbit();
      var probe = baseOrbit.split(" ");
      probe[2] = "100%";
      viewer.cameraOrbit = probe.join(" ");
      viewer.jumpCameraToGoal();
      var probed = viewer.getCameraOrbit();
      var idealRadius = probed.radius;
      basePhi = probed.phi;
      viewer.cameraOrbit =
        current.theta + "rad " + current.phi + "rad " + current.radius + "m";
      viewer.jumpCameraToGoal();

      var parts = baseOrbit.split(" ");
      var wanted = parts[2];
      var baseRadius = /%$/.test(wanted)
        ? (idealRadius * parseFloat(wanted)) / 100
        : parseFloat(wanted);
      var needed = neededRadius(width / height);

      initialOrbit = baseOrbit;
      if (needed > baseRadius) {
        parts[2] = needed.toFixed(4) + "m";
        initialOrbit = parts.join(" ");
      }
      if (!touched) {
        viewer.cameraOrbit = initialOrbit;
        viewer.jumpCameraToGoal();
      }
    }
    var fitTimer = null;
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        window.clearTimeout(fitTimer);
        fitTimer = window.setTimeout(fitOrbit, 150);
      }).observe(viewer);
    }

    viewer.addEventListener("load", function () {
      if (loadTimer) window.clearTimeout(loadTimer);
      modelReady = true;
      fitOrbit();
      root.classList.add("is-loaded");
      // A late load clears any earlier failure (the poster must not linger).
      if (root.classList.contains("is-failed")) recover();
    });

    // Only a model that never rendered is a failure. Once it is on screen,
    // errors are transient: a phone drops the WebGL context when you leave
    // the browser and gives it back on return, and model-viewer rebuilds the
    // scene itself. Showing the poster then is what made it flash back.
    viewer.addEventListener("error", function (event) {
      var type = event.detail && event.detail.type;
      if (type === "webglcontextlost") return;
      if (root.classList.contains("is-loaded")) return;
      fail();
    });

    viewer.addEventListener("camera-change", onUserCamera);
    viewer.addEventListener("pointerdown", markTouched, { passive: true });

    // Coming back to the tab or the page (bfcache): make sure a frame is
    // drawn, in case the browser discarded the canvas while away.
    function redraw() {
      if (!root.classList.contains("is-loaded")) return;
      viewer.jumpCameraToGoal();
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) redraw();
    });
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) redraw();
    });

    if (controls) {
      controls.addEventListener("click", function (event) {
        var button = event.target.closest("button");
        if (!button) return;
        if (button.hasAttribute("data-viewer-reset")) {
          resetView(initialOrbit, initialTarget);
        } else if (button.hasAttribute("data-viewer-zoom")) {
          zoomBy(Number(button.getAttribute("data-viewer-zoom")));
          markTouched();
        }
      });
    }

    guardWheel();
    trackHintHover();
    setupHotspots();
    setupAr();
    enableHotspotPicker();

    // Decoder must be registered before `src` is set (meshopt-compressed GLB).
    customElements.get("model-viewer").meshoptDecoderLocation = decoderSrc;
    viewer.src = modelSrc;
  }

  // Slow connection guard. Background tabs throttle everything, so the clock
  // only counts while the page is visible.
  function armLoadTimer() {
    loadTimer = window.setTimeout(function () {
      if (root.classList.contains("is-loaded")) return;
      if (document.hidden) {
        armLoadTimer();
        return;
      }
      fail();
    }, LOAD_TIMEOUT_MS);
  }

  armLoadTimer();
  customElements.whenDefined("model-viewer").then(bind);
})();
