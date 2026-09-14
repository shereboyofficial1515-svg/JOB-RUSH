/**
 * LiveKit integration. LIVEKIT_API_SECRET never leaves this process —
 * it's used only to sign short-lived access tokens, which is the only
 * thing the frontend ever receives. Room names are derived from the
 * interview ID (`interview-<uuid>`) — not guessable in a useful way,
 * but that's not the security boundary anyway: every call into this
 * module must happen only after the caller has independently verified
 * the requester is an authorized participant, the interview status
 * allows joining, and the timing window is valid. See
 * interviewController.getCallToken for where that check lives.
 */
const { AccessToken } = require('livekit-server-sdk');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const TOKEN_TTL_SECONDS = 10 * 60; // short-lived; re-requested by the client as needed

function assertConfigured() {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
    throw new AppError(
      'Audio/video calling is not configured on this server yet.',
      503,
      'LIVEKIT_NOT_CONFIGURED'
    );
  }
}

function roomNameForInterview(interviewId) {
  return `interview-${interviewId}`;
}

function roomNameForCall(callId) {
  return `call-${callId}`;
}

/**
 * Low-level token issuance shared by both interview and chat-call
 * flows. Every caller of this function must have already done its
 * own participant + status + timing checks — this function only
 * signs what it's told to sign.
 */
async function createAccessToken({ roomName, userId, displayName }) {
  assertConfigured();

  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: displayName,
    ttl: TOKEN_TTL_SECONDS,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: false,
    roomRecord: false,
  });

  return {
    accessToken: await token.toJwt(),
    livekitUrl: env.LIVEKIT_URL,
    roomName,
    expiresInSeconds: TOKEN_TTL_SECONDS,
  };
}

/**
 * Issues a token scoped to exactly one room, one identity, and a
 * permission set appropriate for an interview call (no recording,
 * no admin room control — just publish/subscribe).
 */
async function createInterviewAccessToken({ interviewId, userId, displayName }) {
  return createAccessToken({ roomName: roomNameForInterview(interviewId), userId, displayName });
}

/** Same permission set, for a chat-originated audio/video call. */
async function createCallAccessToken({ callId, userId, displayName }) {
  return createAccessToken({ roomName: roomNameForCall(callId), userId, displayName });
}

module.exports = {
  createInterviewAccessToken,
  createCallAccessToken,
  roomNameForInterview,
  roomNameForCall,
};
