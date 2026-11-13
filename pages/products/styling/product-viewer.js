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
  var DESKTOP_RADIUS = "125%"; // one zoom step (1 / 0.8) out from the markup's 100%
  var loadTimer = null;

  // Static image (kept hidden, and never downloaded) only if 3D cannot run.
  function fail() {
    if (loadTimer) window.clearTimeout(loadTimer);
    root.classList.add("is-failed");
    if (fallback) fallback.hidden = false;
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

  function markTouched() {
    root.classList.add("is-touched");
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
  // removed when the page has no hotspots.
  function setupHotspots() {
    var button = root.querySelector("[data-viewer-hotspots]");
    if (!button) return;
    if (!viewer.querySelector('[slot^="hotspot-"]')) {
      button.hidden = true;
      return;
    }
    button.addEventListener("click", function () {
      var on = !root.classList.contains("is-hotspotsOn");
      root.classList.toggle("is-hotspotsOn", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
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
    // desktop has plenty, so it starts one zoom step further out. The reset
    // button returns to the same view.
    var radius = null;
    if (window.matchMedia("(max-width: 768px)").matches) {
      radius = COMPACT_RADIUS;
    } else if (window.matchMedia("(min-width: 1025px)").matches) {
      radius = DESKTOP_RADIUS;
    }
    if (radius) {
      var parts = initialOrbit.split(" ");
      if (parts.length === 3) {
        parts[2] = radius;
        initialOrbit = parts.join(" ");
        viewer.cameraOrbit = initialOrbit;
      }
    }

    viewer.addEventListener("load", function () {
      if (loadTimer) window.clearTimeout(loadTimer);
      root.classList.add("is-loaded");
    });
    viewer.addEventListener("error", fail);

    viewer.addEventListener("camera-change", function (event) {
      if (event.detail && event.detail.source === "user-interaction") {
        markTouched();
      }
    });
    viewer.addEventListener("pointerdown", markTouched, { passive: true });

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

  loadTimer = window.setTimeout(fail, LOAD_TIMEOUT_MS);
  customElements.whenDefined("model-viewer").then(bind);
})();
