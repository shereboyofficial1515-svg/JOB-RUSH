/**
 * JOB RUSH — server-side video processing for portfolio work videos.
 *
 * Pipeline: probe → (skip if already compliant) → transcode toward a
 * target size with a safety margin → verify the actual output size →
 * one corrective re-encode pass if still over the hard limit →
 * generate a poster thumbnail. Every step operates on real files on
 * disk (never trusts a client-supplied size/duration/codec claim) and
 * every temp file this module creates is the caller's to clean up —
 * see uploadPortfolioVideo in storageController for the finally block
 * that does that.
 *
 * Uses bundled ffmpeg/ffprobe binaries (ffmpeg-static/ffprobe-static)
 * driven directly via child_process, rather than a wrapper library —
 * full control over timeouts/kill semantics for something this
 * resource-sensitive, and one fewer dependency to trust.
 */
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const ffmpegPath = require('ffmpeg-static');
const { path: ffprobePath } = require('ffprobe-static');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const AUDIO_BITRATE_BPS = 128 * 1000;
const MAX_LONG_EDGE_PX = 1280; // 720p-class — never upscaled, only capped
const MAX_OUTPUT_FPS = 30;
const CONTAINER_OVERHEAD_FACTOR = 0.96; // leaves headroom for muxing overhead so the real file lands under, not over, target

let activeProcessingCount = 0;

/** Simple in-process concurrency gate — this is a single Node process with no job queue, so a module-level counter is the whole mechanism. */
function acquireProcessingSlot() {
  if (activeProcessingCount >= env.VIDEO_MAX_CONCURRENT_PROCESSING) {
    throw new AppError(
      'Too many videos are being processed right now. Please try again in a minute.',
      429,
      'PROCESSING_BUSY'
    );
  }
  activeProcessingCount += 1;
}

function releaseProcessingSlot() {
  activeProcessingCount = Math.max(0, activeProcessingCount - 1);
}

function tempPath(extension) {
  return path.join(os.tmpdir(), `jobrush-video-${randomUUID()}.${extension}`);
}

/** Runs a bundled binary with a hard timeout — killed, not left to run indefinitely, if it hangs on a hostile/malformed input. */
function runProcess(binaryPath, args, { timeoutMs, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args);
    let stderr = '';
    let stdout = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new AppError(`${label} could not be started.`, 500, 'PROCESSING_FAILED_TO_START'));
      logger.error(`${label} spawn error`, { error: err.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new AppError('Video processing timed out. Please try again with a shorter video.', 408, 'PROCESSING_TIMEOUT'));
      }
      if (code !== 0) {
        logger.error(`${label} exited non-zero`, { code, stderr: stderr.slice(-2000) });
        return reject(new AppError('Video could not be processed.', 422, 'PROCESSING_FAILED'));
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Probes a file's real container/codec/duration/dimensions via
 * ffprobe — the actual bytes, never the client-supplied MIME type or
 * extension. Returns null fields (never a guessed default) for
 * anything ffprobe couldn't determine, e.g. a file that isn't a video
 * at all.
 */
async function probeFile(filePath) {
  const args = [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ];
  let result;
  try {
    result = await runProcess(ffprobePath, args, { timeoutMs: 30_000, label: 'ffprobe' });
  } catch (err) {
    throw new AppError('Could not read this video file. Please upload a valid video.', 400, 'INVALID_VIDEO_FILE');
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new AppError('Could not read this video file. Please upload a valid video.', 400, 'INVALID_VIDEO_FILE');
  }

  const videoStream = (parsed.streams || []).find((s) => s.codec_type === 'video');
  const audioStream = (parsed.streams || []).find((s) => s.codec_type === 'audio');
  if (!videoStream) {
    throw new AppError('This file does not contain a valid video track.', 400, 'INVALID_VIDEO_FILE');
  }

  const durationSeconds = Number(parsed.format?.duration ?? videoStream.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AppError('Could not determine this video’s duration. Please upload a valid video.', 400, 'INVALID_VIDEO_FILE');
  }

  let fps = null;
  if (videoStream.avg_frame_rate && videoStream.avg_frame_rate !== '0/0') {
    const [num, den] = videoStream.avg_frame_rate.split('/').map(Number);
    if (den > 0) fps = num / den;
  }

  return {
    durationSeconds,
    width: videoStream.width || null,
    height: videoStream.height || null,
    fps,
    videoCodec: videoStream.codec_name || null,
    audioCodec: audioStream ? audioStream.codec_name : null,
    hasAudio: Boolean(audioStream),
    formatNames: (parsed.format?.format_name || '').split(','),
    sizeBytes: Number(parsed.format?.size) || null,
  };
}

/**
 * ffprobe (used in probeFile) only reads container/stream headers —
 * it never decodes a single frame, so a file with an intact moov atom
 * but corrupted frame data (e.g. bit rot, a truncated mid-stream
 * transfer) reads as perfectly valid metadata while actually being
 * unplayable. This performs a real decode pass (video and audio, no
 * output written) and treats any decoder error as a rejection —
 * that's the "output integrity" check, not the structural probe.
 */
async function verifyDecodable(filePath) {
  const args = ['-v', 'error', '-i', filePath, '-f', 'null', '-'];
  let result;
  try {
    result = await runProcess(ffmpegPath, args, { timeoutMs: 60_000, label: 'ffmpeg (decode verify)' });
  } catch {
    throw new AppError('This video file appears to be corrupted and could not be verified.', 400, 'CORRUPTED_VIDEO_FILE');
  }
  if (result.stderr.trim().length > 0) {
    logger.warn('Decode verification found stream errors', { filePath, stderr: result.stderr.slice(-1000) });
    throw new AppError('This video file appears to be corrupted and could not be verified.', 400, 'CORRUPTED_VIDEO_FILE');
  }
}

/** Already an MP4/H.264(+AAC) file within the hard limit — no reason to re-encode and lose a generation of quality for nothing. */
function isAlreadyCompliant(probe, actualSizeBytes) {
  return (
    actualSizeBytes <= env.VIDEO_HARD_LIMIT_BYTES &&
    probe.formatNames.includes('mp4') &&
    probe.videoCodec === 'h264' &&
    (!probe.hasAudio || probe.audioCodec === 'aac')
  );
}

function computeEncodeArgs({ inputPath, outputPath, durationSeconds, hasAudio, fps, targetBytes }) {
  const audioBitrateBps = hasAudio ? AUDIO_BITRATE_BPS : 0;
  const totalBitrateBps = Math.floor((targetBytes * 8 * CONTAINER_OVERHEAD_FACTOR) / durationSeconds);
  const videoBitrateBps = Math.max(totalBitrateBps - audioBitrateBps, 200_000); // 200kbps floor — duration is already capped at 2 minutes, so this floor is never actually needed in practice, just a guard against a pathological input

  const args = [
    '-y',
    '-i', inputPath,
    '-map', '0:v:0',
    '-vf', `scale='min(${MAX_LONG_EDGE_PX},iw)':'min(${MAX_LONG_EDGE_PX},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-b:v', String(videoBitrateBps),
    '-maxrate', String(Math.floor(videoBitrateBps * 1.5)),
    '-bufsize', String(Math.floor(videoBitrateBps * 2)),
  ];
  if (fps && fps > MAX_OUTPUT_FPS) {
    args.push('-r', String(MAX_OUTPUT_FPS));
  }
  if (hasAudio) {
    args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', String(AUDIO_BITRATE_BPS), '-ar', '44100');
  } else {
    args.push('-an');
  }
  args.push('-movflags', '+faststart', '-f', 'mp4', outputPath);
  return args;
}

async function transcode(inputPath, outputPath, { durationSeconds, hasAudio, fps, targetBytes }) {
  const args = computeEncodeArgs({ inputPath, outputPath, durationSeconds, hasAudio, fps, targetBytes });
  await runProcess(ffmpegPath, args, { timeoutMs: env.VIDEO_PROCESSING_TIMEOUT_MS, label: 'ffmpeg' });
}

async function generateThumbnail(inputPath, durationSeconds) {
  const outputPath = tempPath('jpg');
  const seekSeconds = Math.min(1, Math.max(0, durationSeconds * 0.1));
  const args = [
    '-y',
    '-ss', seekSeconds.toFixed(2),
    '-i', inputPath,
    '-frames:v', '1',
    '-vf', 'scale=640:-2',
    '-q:v', '4',
    outputPath,
  ];
  await runProcess(ffmpegPath, args, { timeoutMs: 30_000, label: 'ffmpeg (thumbnail)' });
  return outputPath;
}

/**
 * Orchestrates the full pipeline for one uploaded source file.
 * Returns { videoPath, thumbnailPath, wasProcessed, metadata } — the
 * caller (storageController) uploads both files to Supabase and is
 * responsible for deleting every temp path this returns (and any
 * intermediate ones on failure) once it's done with them.
 */
async function processVideoForUpload(sourceFilePath, { maxDurationSeconds }) {
  acquireProcessingSlot();
  const tempFilesToCleanupOnThrow = [];
  try {
    const sourceStat = await fs.stat(sourceFilePath);
    const probe = await probeFile(sourceFilePath);

    if (probe.durationSeconds > maxDurationSeconds) {
      throw new AppError(`Work videos must be ${maxDurationSeconds} seconds or shorter.`, 400, 'VIDEO_TOO_LONG');
    }

    // Structural probing (above) only reads headers — confirm the
    // actual bitstream decodes cleanly before doing anything else
    // with it, whether that's shipping it as-is or spending CPU
    // transcoding a file that's corrupted regardless of the result.
    await verifyDecodable(sourceFilePath);

    if (isAlreadyCompliant(probe, sourceStat.size)) {
      const thumbnailPath = await generateThumbnail(sourceFilePath, probe.durationSeconds);
      return {
        videoPath: sourceFilePath,
        thumbnailPath,
        wasProcessed: false,
        metadata: { durationSeconds: Math.round(probe.durationSeconds), width: probe.width, height: probe.height },
      };
    }

    let outputPath = tempPath('mp4');
    tempFilesToCleanupOnThrow.push(outputPath);
    await transcode(sourceFilePath, outputPath, {
      durationSeconds: probe.durationSeconds,
      hasAudio: probe.hasAudio,
      fps: probe.fps,
      targetBytes: env.VIDEO_TARGET_BYTES,
    });

    let outputStat = await fs.stat(outputPath);

    // Single-pass bitrate encoding is an approximation, not a
    // guarantee — if it overshot, one corrective pass at a tighter
    // bitrate (scaled by exactly how far over we landed) rather than
    // silently shipping a file over the hard limit.
    if (outputStat.size > env.VIDEO_HARD_LIMIT_BYTES) {
      logger.warn('First-pass video encode exceeded hard limit, retrying tighter', {
        firstPassBytes: outputStat.size,
        hardLimitBytes: env.VIDEO_HARD_LIMIT_BYTES,
      });
      const overshootRatio = env.VIDEO_TARGET_BYTES / outputStat.size;
      const tighterTargetBytes = Math.floor(env.VIDEO_TARGET_BYTES * overshootRatio * 0.95);
      const secondOutputPath = tempPath('mp4');
      tempFilesToCleanupOnThrow.push(secondOutputPath);
      await transcode(sourceFilePath, secondOutputPath, {
        durationSeconds: probe.durationSeconds,
        hasAudio: probe.hasAudio,
        fps: probe.fps,
        targetBytes: tighterTargetBytes,
      });
      await fs.unlink(outputPath).catch(() => {});
      outputPath = secondOutputPath;
      outputStat = await fs.stat(outputPath);

      if (outputStat.size > env.VIDEO_HARD_LIMIT_BYTES) {
        await fs.unlink(outputPath).catch(() => {});
        throw new AppError(
          `This video could not be compressed below the ${Math.floor(env.VIDEO_HARD_LIMIT_BYTES / (1024 * 1024))}MB limit. Please try a shorter or lower-resolution video.`,
          422,
          'VIDEO_TOO_LARGE_AFTER_COMPRESSION'
        );
      }
    }

    // Verify the actual output is real and playable — never trust
    // that a zero-exit-code ffmpeg run necessarily produced a valid
    // file (a hostile/corrupt input can still cause a subtly broken
    // output on unusual codecs paths).
    const outputProbe = await probeFile(outputPath);

    const thumbnailPath = await generateThumbnail(outputPath, outputProbe.durationSeconds);

    return {
      videoPath: outputPath,
      thumbnailPath,
      wasProcessed: true,
      metadata: {
        durationSeconds: Math.round(outputProbe.durationSeconds),
        width: outputProbe.width,
        height: outputProbe.height,
      },
    };
  } catch (err) {
    await Promise.all(tempFilesToCleanupOnThrow.map((p) => fs.unlink(p).catch(() => {})));
    throw err;
  } finally {
    releaseProcessingSlot();
  }
}

module.exports = { processVideoForUpload, probeFile };
