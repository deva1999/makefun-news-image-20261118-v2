// makefun-news-image-20261118 — variant 2
//
// The entry is a single image, entry.png, bundled in this repository next
// to this file. Running this script copies it to the grader's output
// location: /output/entry.png, or $MAKEFUN_OUTPUT_DIR/entry.png when that
// variable is set.
//
// Nothing is generated here: the image is shipped as-is, and the script's
// only job is to deliver it intact. Before writing anything it checks the
// bundled file is really a PNG, that its dimensions fit inside 1024x1024,
// and that it is no bigger than 1 MiB. The copy goes through a temporary
// file in the destination directory and is renamed into place, so a reader
// never sees a half-written file; afterwards the SHA-256 of what landed on
// disk is compared against the source, and any mismatch aborts loudly.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_SIZE = 1024 * 1024; // 1 MiB
const MAX_SIDE = 1024;

function abort(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

// Big-endian 32-bit unsigned integer at an offset in a buffer.
function u32be(buf, offset) {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  ) >>> 0;
}

// Width and height from a PNG's IHDR chunk, which follows the 8-byte
// signature: 4 bytes of chunk length, 4 bytes of chunk type ("IHDR"),
// then width and height as big-endian 32-bit integers.
function readPngSize(buf) {
  if (buf.length < 24) {
    abort("bundled file is too short to be a PNG");
  }
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    abort("bundled file is not a PNG (bad signature)");
  }
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") {
    abort("bundled file has no IHDR chunk where one belongs");
  }
  return { width: u32be(buf, 16), height: u32be(buf, 20) };
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourcePath = resolve(here, "entry.png");

  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    abort(`bundled image missing: ${sourcePath}`);
  }
  const source = readFileSync(sourcePath);
  const { width, height } = readPngSize(source);
  if (width > MAX_SIDE || height > MAX_SIDE) {
    abort(
      `image is ${width}x${height}, larger than the ${MAX_SIDE}x${MAX_SIDE} cap`,
    );
  }
  if (source.length > MAX_SIZE) {
    abort(`image is ${source.length} bytes, over the ${MAX_SIZE} byte cap`);
  }

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  const stagingPath = join(outDir, `.entry.png.tmp-${process.pid}`);

  try {
    writeFileSync(stagingPath, source);
    renameSync(stagingPath, outPath);
  } catch (err) {
    try {
      if (existsSync(stagingPath)) unlinkSync(stagingPath);
    } catch {
      // Cleanup is best effort; the write error is what gets reported.
    }
    abort(`could not write ${outPath}: ${err.message}`);
  }

  const delivered = readFileSync(outPath);
  if (delivered.length !== source.length) {
    abort(
      `delivered file is ${delivered.length} bytes, ` +
        `source is ${source.length} bytes`,
    );
  }
  if (sha256(delivered) !== sha256(source)) {
    abort("SHA-256 of the delivered file does not match the source");
  }

  console.log(
    `wrote ${outPath} (${width}x${height}, ${delivered.length} bytes, ` +
      `sha256 ${sha256(delivered)})`,
  );
}

main();
