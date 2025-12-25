import * as zlib from 'zlib';

/**
 * Compress data using zlib deflate (like Git does)
 */
export function compress(data: Buffer): Buffer {
  return zlib.deflateSync(data);
}

/**
 * Decompress zlib-compressed data
 */
export function decompress(data: Buffer): Buffer {
  return zlib.inflateSync(data);
}
