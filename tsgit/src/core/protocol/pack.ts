import * as crypto from 'crypto';
import { PackHeader, PackObjectType } from './types';

/**
 * Pack file signature
 */
export const PACK_SIGNATURE = Buffer.from('PACK');

/**
 * Read a variable-length integer (size encoding used in pack files)
 * Returns the value and the number of bytes consumed
 */
export function readVariableInt(data: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;

  while (true) {
    if (offset + bytesRead >= data.length) {
      throw new Error('Unexpected end of data while reading variable int');
    }

    const byte = data[offset + bytesRead];
    bytesRead++;

    value |= (byte & 0x7f) << shift;
    shift += 7;

    if ((byte & 0x80) === 0) {
      break;
    }
  }

  return { value, bytesRead };
}

/**
 * Write a variable-length integer
 */
export function writeVariableInt(value: number): Buffer {
  const bytes: number[] = [];

  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>= 7;
  }
  bytes.push(value);

  return Buffer.from(bytes);
}

/**
 * Read pack object header (type and size)
 * Format: (MSB)(type:3)(size:4) followed by continuation bytes for size
 */
export function readPackObjectHeader(data: Buffer, offset: number): {
  type: PackObjectType;
  size: number;
  bytesRead: number;
} {
  if (offset >= data.length) {
    throw new Error('Unexpected end of data while reading pack object header');
  }

  const firstByte = data[offset];
  const type = ((firstByte >> 4) & 0x07) as PackObjectType;
  let size = firstByte & 0x0f;
  let shift = 4;
  let bytesRead = 1;

  // Read continuation bytes
  if (firstByte & 0x80) {
    while (true) {
      if (offset + bytesRead >= data.length) {
        throw new Error('Unexpected end of data while reading pack object size');
      }

      const byte = data[offset + bytesRead];
      bytesRead++;

      size |= (byte & 0x7f) << shift;
      shift += 7;

      if ((byte & 0x80) === 0) {
        break;
      }
    }
  }

  return { type, size, bytesRead };
}

/**
 * Write pack object header
 */
export function writePackObjectHeader(type: PackObjectType, size: number): Buffer {
  const bytes: number[] = [];

  // First byte: (MSB)(type:3)(size:4)
  let firstByte = (type << 4) | (size & 0x0f);
  size >>= 4;

  if (size > 0) {
    firstByte |= 0x80;
  }
  bytes.push(firstByte);

  // Continuation bytes
  while (size > 0) {
    let byte = size & 0x7f;
    size >>= 7;

    if (size > 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  }

  return Buffer.from(bytes);
}

/**
 * Read OFS_DELTA base offset
 * Uses a special encoding where each byte (except the last) has MSB set
 */
export function readOfsOffset(data: Buffer, offset: number): { value: number; bytesRead: number } {
  if (offset >= data.length) {
    throw new Error('Unexpected end of data while reading OFS offset');
  }

  let byte = data[offset];
  let value = byte & 0x7f;
  let bytesRead = 1;

  while (byte & 0x80) {
    if (offset + bytesRead >= data.length) {
      throw new Error('Unexpected end of data while reading OFS offset');
    }

    byte = data[offset + bytesRead];
    bytesRead++;

    // Add 1 to the accumulated value, then shift and add new bits
    value = ((value + 1) << 7) | (byte & 0x7f);
  }

  return { value, bytesRead };
}

/**
 * Write OFS_DELTA base offset
 */
export function writeOfsOffset(offset: number): Buffer {
  const bytes: number[] = [];

  // Work backwards from the offset
  bytes.push(offset & 0x7f);
  offset >>= 7;

  while (offset > 0) {
    offset--;
    bytes.push(0x80 | (offset & 0x7f));
    offset >>= 7;
  }

  // Reverse because we built it backwards
  bytes.reverse();
  return Buffer.from(bytes);
}

/**
 * Parse pack file header
 */
export function parsePackHeader(data: Buffer): PackHeader {
  if (data.length < 12) {
    throw new Error('Pack data too short for header');
  }

  const signature = data.slice(0, 4).toString('ascii');
  if (signature !== 'PACK') {
    throw new Error(`Invalid pack signature: ${signature}`);
  }

  const version = data.readUInt32BE(4);
  if (version !== 2 && version !== 3) {
    throw new Error(`Unsupported pack version: ${version}`);
  }

  const objectCount = data.readUInt32BE(8);

  return { signature, version, objectCount };
}

/**
 * Write pack file header
 */
export function writePackHeader(objectCount: number, version: number = 2): Buffer {
  const header = Buffer.alloc(12);
  header.write('PACK', 0, 4, 'ascii');
  header.writeUInt32BE(version, 4);
  header.writeUInt32BE(objectCount, 8);
  return header;
}

/**
 * Calculate SHA-1 checksum for pack file verification
 * Pack files use SHA-1 for checksum regardless of object hash algorithm
 */
export function calculatePackChecksum(data: Buffer): Buffer {
  return crypto.createHash('sha1').update(data).digest();
}

/**
 * Verify pack file checksum
 */
export function verifyPackChecksum(data: Buffer): boolean {
  if (data.length < 20) {
    return false;
  }

  const content = data.slice(0, -20);
  const expectedChecksum = data.slice(-20);
  const actualChecksum = calculatePackChecksum(content);

  return actualChecksum.equals(expectedChecksum);
}

/**
 * Apply a delta to a base object
 * Delta format:
 *   - Source size (variable int)
 *   - Target size (variable int)
 *   - Instructions (copy or insert)
 */
export function applyDelta(base: Buffer, delta: Buffer): Buffer {
  let offset = 0;

  // Read source size
  const sourceSize = readDeltaSize(delta, offset);
  offset = sourceSize.bytesRead;

  if (base.length !== sourceSize.value) {
    throw new Error(`Delta source size mismatch: expected ${sourceSize.value}, got ${base.length}`);
  }

  // Read target size
  const targetSize = readDeltaSize(delta, offset);
  offset += targetSize.bytesRead;

  const result = Buffer.alloc(targetSize.value);
  let resultOffset = 0;

  // Process instructions
  while (offset < delta.length) {
    const cmd = delta[offset++];

    if (cmd & 0x80) {
      // Copy instruction
      let copyOffset = 0;
      let copySize = 0;

      if (cmd & 0x01) copyOffset = delta[offset++];
      if (cmd & 0x02) copyOffset |= delta[offset++] << 8;
      if (cmd & 0x04) copyOffset |= delta[offset++] << 16;
      if (cmd & 0x08) copyOffset |= delta[offset++] << 24;

      if (cmd & 0x10) copySize = delta[offset++];
      if (cmd & 0x20) copySize |= delta[offset++] << 8;
      if (cmd & 0x40) copySize |= delta[offset++] << 16;

      // Size of 0 means 0x10000
      if (copySize === 0) copySize = 0x10000;

      if (copyOffset + copySize > base.length) {
        throw new Error('Delta copy extends beyond base object');
      }

      base.copy(result, resultOffset, copyOffset, copyOffset + copySize);
      resultOffset += copySize;
    } else if (cmd !== 0) {
      // Insert instruction (cmd is the size)
      const insertSize = cmd;
      if (offset + insertSize > delta.length) {
        throw new Error('Delta insert extends beyond delta data');
      }

      delta.copy(result, resultOffset, offset, offset + insertSize);
      offset += insertSize;
      resultOffset += insertSize;
    } else {
      throw new Error('Invalid delta instruction: 0');
    }
  }

  if (resultOffset !== targetSize.value) {
    throw new Error(`Delta result size mismatch: expected ${targetSize.value}, got ${resultOffset}`);
  }

  return result;
}

/**
 * Read delta size (special variable-length encoding)
 */
function readDeltaSize(data: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;

  while (true) {
    if (offset + bytesRead >= data.length) {
      throw new Error('Unexpected end of delta while reading size');
    }

    const byte = data[offset + bytesRead];
    bytesRead++;

    value |= (byte & 0x7f) << shift;
    shift += 7;

    if ((byte & 0x80) === 0) {
      break;
    }
  }

  return { value, bytesRead };
}

/**
 * Create a delta between two buffers
 * Returns null if creating a delta would be inefficient
 */
export function createDelta(source: Buffer, target: Buffer): Buffer | null {
  // For very small objects, delta might not be worth it
  if (target.length < 16) {
    return null;
  }

  const parts: Buffer[] = [];

  // Write source size
  parts.push(writeDeltaSize(source.length));

  // Write target size
  parts.push(writeDeltaSize(target.length));

  // Simple delta implementation: look for matching chunks
  // This is a simplified version; real Git uses more sophisticated algorithms
  
  let targetOffset = 0;
  let insertStart = 0;
  let insertMode = true;

  const flushInsert = () => {
    if (insertMode && insertStart < targetOffset) {
      const insertData = target.slice(insertStart, targetOffset);
      let pos = 0;
      while (pos < insertData.length) {
        const chunkSize = Math.min(127, insertData.length - pos);
        parts.push(Buffer.from([chunkSize]));
        parts.push(insertData.slice(pos, pos + chunkSize));
        pos += chunkSize;
      }
    }
    insertStart = targetOffset;
  };

  // Build a simple hash table for source chunks
  const chunkSize = 16;
  const sourceIndex = new Map<string, number>();
  
  for (let i = 0; i <= source.length - chunkSize; i++) {
    const chunk = source.slice(i, i + chunkSize).toString('hex');
    if (!sourceIndex.has(chunk)) {
      sourceIndex.set(chunk, i);
    }
  }

  while (targetOffset < target.length) {
    // Try to find a matching chunk in source
    if (targetOffset <= target.length - chunkSize) {
      const targetChunk = target.slice(targetOffset, targetOffset + chunkSize).toString('hex');
      const sourceOffset = sourceIndex.get(targetChunk);

      if (sourceOffset !== undefined) {
        flushInsert();

        // Extend the match as far as possible
        let matchLen = chunkSize;
        while (
          targetOffset + matchLen < target.length &&
          sourceOffset + matchLen < source.length &&
          target[targetOffset + matchLen] === source[sourceOffset + matchLen]
        ) {
          matchLen++;
        }

        // Write copy instruction
        parts.push(createCopyInstruction(sourceOffset, matchLen));
        
        targetOffset += matchLen;
        insertStart = targetOffset;
        insertMode = true;
        continue;
      }
    }

    // No match found, continue with insert mode
    targetOffset++;
  }

  // Flush any remaining insert
  flushInsert();

  const delta = Buffer.concat(parts);

  // Only return delta if it's actually smaller
  if (delta.length < target.length) {
    return delta;
  }

  return null;
}

/**
 * Write delta size
 */
function writeDeltaSize(size: number): Buffer {
  const bytes: number[] = [];

  while (size >= 0x80) {
    bytes.push((size & 0x7f) | 0x80);
    size >>= 7;
  }
  bytes.push(size);

  return Buffer.from(bytes);
}

/**
 * Create a copy instruction for delta
 */
function createCopyInstruction(offset: number, size: number): Buffer {
  const bytes: number[] = [];
  let cmd = 0x80;
  const params: number[] = [];

  // Offset bytes
  if (offset & 0xff) {
    cmd |= 0x01;
    params.push(offset & 0xff);
  }
  if (offset & 0xff00) {
    cmd |= 0x02;
    params.push((offset >> 8) & 0xff);
  }
  if (offset & 0xff0000) {
    cmd |= 0x04;
    params.push((offset >> 16) & 0xff);
  }
  if (offset & 0xff000000) {
    cmd |= 0x08;
    params.push((offset >> 24) & 0xff);
  }

  // Size bytes (size of 0x10000 is encoded as 0)
  const encodedSize = size === 0x10000 ? 0 : size;
  if (encodedSize & 0xff) {
    cmd |= 0x10;
    params.push(encodedSize & 0xff);
  }
  if (encodedSize & 0xff00) {
    cmd |= 0x20;
    params.push((encodedSize >> 8) & 0xff);
  }
  if (encodedSize & 0xff0000) {
    cmd |= 0x40;
    params.push((encodedSize >> 16) & 0xff);
  }

  bytes.push(cmd, ...params);
  return Buffer.from(bytes);
}
