/**
 * Image processor — converts any input format to a Frame TV-ready JPEG.
 *
 * Spec:
 *  - Max resolution: 3840×2160 (fit inside, never upscale)
 *  - Format: JPEG, quality 90
 *  - Strip EXIF/metadata (privacy)
 *  - Reject if output > 20 MB
 */

import sharp from "sharp";

const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2160;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024; // 20 MB

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  fileSizeBytes: number;
  fileType: "jpg";
}

export async function processForFrameTV(
  inputBuffer: Buffer,
  quality = Number(process.env.TARGET_IMAGE_QUALITY) || 90
): Promise<ProcessedImage> {
  const pipeline = sharp(inputBuffer, {
    failOn: "error",
    limitInputPixels: 100_000_000, // ~100 MP; blocks decompression bombs
  })
    .rotate() // auto-orient from EXIF before stripping
    .resize(MAX_WIDTH, MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: false });
  // No .withMetadata() call — sharp strips all EXIF/GPS/XMP by default

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  if (data.byteLength > MAX_OUTPUT_BYTES) {
    throw new Error(
      "Photo is too large for the TV even after resizing. Try reducing the resolution before uploading."
    );
  }

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    fileSizeBytes: data.byteLength,
    fileType: "jpg",
  };
}
