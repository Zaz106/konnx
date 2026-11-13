/* KonNx model prep — developer tool, not part of the site.

   Turns a CAD-export GLB into a web-ready, light-weight GLB for the
   product-page 3D viewer (<model-viewer>, see
   pages/products/styling/product-viewer.js).

   Usage (from this folder):
     npm install
     node optimize-model.mjs <input.glb> <output.glb> [options]

   Example:
     node optimize-model.mjs "C:/Downloads/RS3935-A1.glb" ../../assets/models/EX124BSSRF/ex126bssrf.glb

   Options:
     --error <n>         Simplification tolerance as a fraction of model size.
                         Default 0.0005 (about 0.3 mm on a 600 mm part).
                         Raise to 0.001 for a lighter mesh, lower for detail.
     --texture-size <n>  Longest texture edge in px. Default 512.
     --max-mb <n>        Warn when the result is bigger. Default 1.
     --no-center         Keep the CAD origin. By default the model is moved so
                         its footprint is centred on the origin and it sits on
                         y = 0 (needed for AR: the model is placed and rotated
                         about its origin, so an off-centre origin makes it
                         swing away from the middle of the screen).
     --keep-glass        Keep KHR_materials_transmission (glass). Off by
                         default: transmission makes the renderer draw the
                         whole scene a second time every frame, which is the
                         single most expensive thing a phone GPU can be asked
                         to do here. Glass becomes a plain alpha blend.
     --keep-clearcoat    Keep KHR_materials_clearcoat. Off by default (extra
                         shader layer and an extra shader to compile).
     --double-sided      Keep double-sided materials. Off by default: the
                         connector is made of closed solids, so back faces are
                         never seen and culling them halves the fragment work.

   Pipeline: dedup, palette, flatten, join, weld, simplify, resample, prune,
   sparse, centre, light materials, WebP textures, meshopt reorder, NORMAL
   quantisation, meshopt codec.

   POSITION is deliberately left as float32. model-viewer mis-measures the
   bounding box of meshes whose positions are quantised (it frames a 2 m cube,
   so the product renders tiny). The script checks for this before it writes.

   After centring, any hand-placed coordinates on the page (camera-target and
   hotspot data-position values) move by the printed offset. */

import { parseArgs } from "node:util";
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import {
  dedup,
  flatten,
  join,
  weld,
  simplify,
  prune,
  reorder,
  textureCompress,
  palette,
  sparse,
  resample,
  quantize,
  center,
  getBounds,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

var parsed = parseArgs({
  allowPositionals: true,
  options: {
    error: { type: "string", default: "0.0005" },
    "texture-size": { type: "string", default: "512" },
    "max-mb": { type: "string", default: "1" },
    "no-center": { type: "boolean", default: false },
    "keep-glass": { type: "boolean", default: false },
    "keep-clearcoat": { type: "boolean", default: false },
    "double-sided": { type: "boolean", default: false },
  },
});

var input = parsed.positionals[0];
var output = parsed.positionals[1];
if (!input || !output) {
  console.error("Usage: node optimize-model.mjs <input.glb> <output.glb> [options]  (see header)");
  process.exit(1);
}

var simplifyError = Number(parsed.values.error);
var textureSize = Number(parsed.values["texture-size"]);
var maxMb = Number(parsed.values["max-mb"]);
var opts = parsed.values;

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);

var io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

var document = await io.read(input);
var scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
var before = getBounds(scene);

// Light materials: drop the features that are costly on phones.
function lightMaterials() {
  return function (doc) {
    var glassCount = 0;
    var coatCount = 0;

    doc.getRoot().listMaterials().forEach(function (material) {
      if (!opts["keep-glass"] && material.getExtension("KHR_materials_transmission")) {
        // Same look without the second render pass: a tinted see-through blend.
        material.setAlphaMode("BLEND");
        material.setAlpha(0.45);
        glassCount += 1;
      }
      if (!opts["keep-clearcoat"] && material.getExtension("KHR_materials_clearcoat")) {
        coatCount += 1;
      }
      if (!opts["double-sided"]) material.setDoubleSided(false);
    });

    doc.getRoot().listExtensionsUsed().forEach(function (extension) {
      var name = extension.extensionName;
      if (!opts["keep-glass"] && name === "KHR_materials_transmission") extension.dispose();
      if (!opts["keep-clearcoat"] && name === "KHR_materials_clearcoat") extension.dispose();
    });

    console.log("Materials: " + glassCount + " glass -> blend, " + coatCount + " clearcoat removed" +
      (opts["double-sided"] ? "" : ", single-sided"));
  };
}

var steps = [
  dedup(),
  palette({ min: 5 }),
  flatten(),
  join(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: simplifyError }),
  resample(),
  prune(),
  sparse(),
];
if (!opts["no-center"]) steps.push(center({ pivot: "below" }));
steps.push(
  lightMaterials(),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [textureSize, textureSize],
  }),
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  // Normals only. See the header note about POSITION.
  quantize({
    pattern: /^(NORMAL|TANGENT)$/,
    patternTargets: /^(NORMAL|TANGENT)$/,
    quantizeNormal: 8,
  })
);

await document.transform(...steps);

// Guard: every POSITION accessor must still be float32.
var quantisedPositions = document
  .getRoot()
  .listMeshes()
  .flatMap(function (mesh) {
    return mesh.listPrimitives();
  })
  .filter(function (primitive) {
    var position = primitive.getAttribute("POSITION");
    return position && position.getComponentType() !== 5126;
  });
if (quantisedPositions.length) {
  console.error("POSITION was quantised. model-viewer will frame this model wrongly. Aborting.");
  process.exit(1);
}

document
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });

await io.write(output, document);

var afterScene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
var after = getBounds(afterScene);
var inMb = fs.statSync(input).size / 1048576;
var outMb = fs.statSync(output).size / 1048576;
var triangles = document
  .getRoot()
  .listMeshes()
  .flatMap(function (mesh) {
    return mesh.listPrimitives();
  })
  .reduce(function (sum, primitive) {
    var indices = primitive.getIndices();
    return sum + (indices ? indices.getCount() / 3 : 0);
  }, 0);
var size = function (bounds) {
  return bounds.max
    .map(function (value, index) {
      return ((value - bounds.min[index]) * 1000).toFixed(0);
    })
    .join(" x ");
};
var fixed = function (list) {
  return list.map(function (value) {
    return value.toFixed(4);
  }).join(" ");
};

console.log("");
console.log("Input   " + inMb.toFixed(2) + " MB   " + size(before) + " mm");
console.log("Output  " + outMb.toFixed(2) + " MB   " + size(after) + " mm   " + Math.round(triangles) + " triangles   -> " + output);
console.log("Bounds  min " + fixed(after.min) + "   max " + fixed(after.max) + "  (metres)");
if (!opts["no-center"]) {
  // Offset applied by centring = new bounds centre minus old bounds centre,
  // with the floor at y = 0.
  var offset = [
    (after.min[0] + after.max[0]) / 2 - (before.min[0] + before.max[0]) / 2,
    after.min[1] - before.min[1],
    (after.min[2] + after.max[2]) / 2 - (before.min[2] + before.max[2]) / 2,
  ];
  console.log("Offset  " + fixed(offset) + "  (add to camera-target and every hotspot data-position)");
}
if (outMb > maxMb) {
  console.log("Warning: over " + maxMb + " MB. Try --error 0.001 or --texture-size 256.");
}
console.log("Check it in the viewer, then set camera-orbit / camera-target on the page.");
