/* KonNx model prep — developer tool, not part of the site.

   Turns a CAD-export GLB into a web-ready GLB for the product-page 3D viewer
   (<model-viewer>, see pages/products/styling/product-viewer.js).

   Usage (from this folder):
     npm install
     node optimize-model.mjs <input.glb> <output.glb> [options]

   Example:
     node optimize-model.mjs "C:/Downloads/RS3935-A1.glb" ../../assets/models/EX124BSSRF/ex126bssrf.glb

   Options:
     --error <n>         Simplification tolerance as a fraction of model size.
                         Default 0.0005 (about 0.3 mm on a 600 mm part).
                         Raise to 0.001 for a smaller file, lower for more detail.
     --texture-size <n>  Longest texture edge in px. Default 512.
     --max-mb <n>        Warn when the result is bigger. Default 1.

   Pipeline: dedup, palette, flatten, join, weld, simplify, resample, prune,
   sparse, WebP textures, meshopt reorder, NORMAL quantisation, meshopt codec.

   POSITION is deliberately left as float32. model-viewer mis-measures the
   bounding box of meshes whose positions are quantised (it frames a 2 m cube,
   so the product renders tiny). The script checks for this before it writes. */

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
  },
});

var input = parsed.positionals[0];
var output = parsed.positionals[1];
if (!input || !output) {
  console.error("Usage: node optimize-model.mjs <input.glb> <output.glb> [--error 0.0005] [--texture-size 512]");
  process.exit(1);
}

var simplifyError = Number(parsed.values.error);
var textureSize = Number(parsed.values["texture-size"]);
var maxMb = Number(parsed.values["max-mb"]);

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

await document.transform(
  dedup(),
  palette({ min: 5 }),
  flatten(),
  join(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: simplifyError }),
  resample(),
  prune(),
  sparse(),
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

var after = getBounds(document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0]);
var inMb = fs.statSync(input).size / 1048576;
var outMb = fs.statSync(output).size / 1048576;
var size = function (bounds) {
  return bounds.max
    .map(function (value, index) {
      return ((value - bounds.min[index]) * 1000).toFixed(0);
    })
    .join(" x ");
};

console.log("");
console.log("Input   " + inMb.toFixed(2) + " MB   " + size(before) + " mm");
console.log("Output  " + outMb.toFixed(2) + " MB   " + size(after) + " mm   -> " + output);
if (outMb > maxMb) {
  console.log("Warning: over " + maxMb + " MB. Try --error 0.001 or --texture-size 256.");
}
console.log("Check it in the viewer, then set camera-orbit / camera-target on the page.");
