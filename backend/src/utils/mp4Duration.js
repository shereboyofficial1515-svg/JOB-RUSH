/**
 * Dependency-free MP4 metadata reader — no ffmpeg/ffprobe binary
 * required. Walks the ISO BMFF box structure (the same container
 * format QuickTime/MP4 always use) to find `moov > mvhd` for overall
 * duration and `moov > trak > tkhd` for the video track's display
 * dimensions. This is a real parse of the file's actual bytes, not a
 * trust-the-client value — the thing spec section "server-side
 * validation is mandatory" is asking for.
 *
 * Doesn't cover WebM (a completely different, EBML-based container)
 * — only MP4 is in the allowed upload list (see storageService), so
 * that's the only format this needs to understand.
 */

function readBoxes(buffer, start, end) {
  const boxes = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;

    if (size === 1) {
      // 64-bit extended size, stored in the next 8 bytes.
      if (offset + 16 > end) break;
      const high = buffer.readUInt32BE(offset + 8);
      const low = buffer.readUInt32BE(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      // Box extends to the end of the file/buffer.
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) break; // malformed/truncated — stop rather than misread

    boxes.push({ type, start: offset, headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

function findBox(boxes, type) {
  return boxes.find((b) => b.type === type);
}

/**
 * @param {Buffer} buffer the full uploaded file
 * @returns {{ durationSeconds: number|null, width: number|null, height: number|null }}
 *   Any field the parse couldn't determine is null — callers decide
 *   whether "couldn't determine duration" should itself be a
 *   rejection (it should, for an upload claiming to be a playable
 *   video) rather than silently treated as 0/allowed.
 */
function readMp4Metadata(buffer) {
  const result = { durationSeconds: null, width: null, height: null };

  const topLevel = readBoxes(buffer, 0, buffer.length);
  const moov = findBox(topLevel, 'moov');
  if (!moov) return result; // not a box-structured MP4 we can read, or corrupt

  const moovChildren = readBoxes(buffer, moov.start + moov.headerSize, moov.end);

  const mvhd = findBox(moovChildren, 'mvhd');
  if (mvhd) {
    const version = buffer.readUInt8(mvhd.start + mvhd.headerSize);
    // Version 0: 32-bit timescale/duration; version 1: 64-bit.
    const base = mvhd.start + mvhd.headerSize + (version === 1 ? 1 + 3 + 8 + 8 : 1 + 3 + 4 + 4);
    let timescale;
    let duration;
    if (version === 1) {
      timescale = buffer.readUInt32BE(base);
      const high = buffer.readUInt32BE(base + 4);
      const low = buffer.readUInt32BE(base + 8);
      duration = high * 2 ** 32 + low;
    } else {
      timescale = buffer.readUInt32BE(base);
      duration = buffer.readUInt32BE(base + 4);
    }
    if (timescale > 0) {
      result.durationSeconds = duration / timescale;
    }
  }

  // First video track's tkhd carries the display width/height (as a
  // 16.16 fixed-point pair) — enough for a basic sanity check without
  // needing to also decode the sample descriptions to confirm codec.
  const trak = moovChildren.find((b) => b.type === 'trak');
  if (trak) {
    const trakChildren = readBoxes(buffer, trak.start + trak.headerSize, trak.end);
    const tkhd = findBox(trakChildren, 'tkhd');
    if (tkhd) {
      const version = buffer.readUInt8(tkhd.start + tkhd.headerSize);
      const widthOffset = tkhd.start + tkhd.headerSize + (version === 1 ? 88 : 76);
      if (widthOffset + 8 <= tkhd.end) {
        result.width = buffer.readUInt32BE(widthOffset) >> 16;
        result.height = buffer.readUInt32BE(widthOffset + 4) >> 16;
      }
    }
  }

  return result;
}

module.exports = { readMp4Metadata };
