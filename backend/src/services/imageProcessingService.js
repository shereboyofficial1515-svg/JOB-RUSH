/**
 * JOB RUSH — server-side image resizing.
 *
 * Every avatar/thumbnail in the app — a 32px chat avatar, a 44px
 * worker card, a 120px profile photo — was loading the exact same
 * file a user originally uploaded, often a multi-megabyte phone photo
 * thousands of pixels wide. This resizes down to a sane ceiling
 * before the file ever reaches storage, so the browser never
 * downloads more image than it can actually show.
 *
 * Reuses the ffmpeg-static binary already bundled for video
 * processing (see videoProcessingService) rather than adding a
 * second image-processing dependency (e.g. sharp) — ffmpeg resizes a
 * single frame just as well, piped via stdin/stdout so this needs no
 * temp files at all, unlike video (which genuinely needs a real file
 * for ffprobe's seeking).
 */
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const logger = require('../utils/logger');

const CODEC_BY_MIME = {
  'image/jpeg': { format: 'mjpeg', vcodec: 'mjpeg', quality: ['-q:v', '4'] },
  'image/webp': { format: 'webp', vcodec: 'libwebp', quality: ['-q:v', '75'] },
  // 'png' isn't a registered muxer name in this ffmpeg build for
  // single-frame output — image2pipe is the generic raw-image-stream
  // muxer and works with any -c:v, including png.
  'image/png': { format: 'image2pipe', vcodec: 'png', quality: [] },
};

/**
 * Resizes `buffer` so its longest edge is at most `maxDimension`,
 * preserving aspect ratio and never upscaling. Animated GIFs are left
 * untouched (ffmpeg's single-frame pipe path would flatten them to a
 * still image, which is a worse regression than an oversized GIF —
 * GIF avatars/photos are rare in practice). Returns the original
 * buffer unchanged if resizing fails for any reason — a resize is an
 * optimization, never something that should block an otherwise valid
 * upload.
 */
async function resizeImage(buffer, mimeType, maxDimension) {
  const codec = CODEC_BY_MIME[mimeType];
  if (!codec) return buffer; // GIF or anything else not in the map — pass through as-is

  const args = [
    '-v', 'error',
    '-f', 'image2pipe',
    '-i', 'pipe:0',
    '-vf', `scale='min(${maxDimension},iw)':'min(${maxDimension},ih)':force_original_aspect_ratio=decrease`,
    '-vframes', '1',
    '-c:v', codec.vcodec,
    ...codec.quality,
    '-f', codec.format,
    'pipe:1',
  ];

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args);
      const chunks = [];
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('timeout'));
      }, 15_000);

      child.stdout.on('data', (c) => chunks.push(c));
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 || chunks.length === 0) {
          return reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
        }
        resolve(Buffer.concat(chunks));
      });

      child.stdin.write(buffer);
      child.stdin.end();
    });
  } catch (err) {
    logger.warn('Image resize failed, uploading original unresized', { mimeType, error: err.message });
    return buffer;
  }
}

module.exports = { resizeImage };
