const interviewService = require('../services/interviewService');
const questionService = require('../services/interviewQuestionService');
const noteService = require('../services/interviewNoteService');
const evaluationService = require('../services/interviewEvaluationService');
const livekitService = require('../services/livekitService');
const userSummaryService = require('../services/userSummaryService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const JOIN_WINDOW_MINUTES_BEFORE = 15;

const schedule = asyncHandler(async (req, res) => {
  const interview = await interviewService.scheduleInterview(req.user.id, req.body);
  res.status(201).json({ interview });
});

const respond = asyncHandler(async (req, res) => {
  const interview = await interviewService.respondToInvitation(req.params.id, req.user.id, req.body.accept);
  res.status(200).json({ interview });
});

const requestReschedule = asyncHandler(async (req, res) => {
  const interview = await interviewService.requestReschedule(req.params.id, req.user.id, req.body.proposedStartAt);
  res.status(200).json({ interview });
});

const confirmReschedule = asyncHandler(async (req, res) => {
  const interview = await interviewService.confirmReschedule(req.params.id, req.user.id, req.body.newStartAt);
  res.status(200).json({ interview });
});

const cancel = asyncHandler(async (req, res) => {
  const interview = await interviewService.cancelInterview(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ interview });
});

const complete = asyncHandler(async (req, res) => {
  const interview = await interviewService.markCompleted(req.params.id, req.user.id);
  res.status(200).json({ interview });
});

const noShow = asyncHandler(async (req, res) => {
  const interview = await interviewService.markNoShow(req.params.id, req.user.id);
  res.status(200).json({ interview });
});

const listUpcoming = asyncHandler(async (req, res) => {
  const interviews = await interviewService.listUpcomingForUser(req.user.id);
  res.status(200).json({ interviews });
});

const listPast = asyncHandler(async (req, res) => {
  const interviews = await interviewService.listPastForUser(req.user.id);
  res.status(200).json({ interviews });
});

const getById = asyncHandler(async (req, res) => {
  const interview = await interviewService.assertParticipant(req.params.id, req.user.id);
  // Strip location details unless the interview has actually been
  // accepted/scheduled — an in-person address shouldn't be visible
  // to a worker who hasn't accepted yet.
  if (!['scheduled', 'in_progress', 'completed'].includes(interview.status)) {
    interview.location_address = null;
    interview.location_instructions = null;
  }
  res.status(200).json({ interview });
});

const getEvents = asyncHandler(async (req, res) => {
  const events = await interviewService.getEventsForInterview(req.params.id, req.user.id);
  res.status(200).json({ events });
});

/**
 * GET /api/interviews/:id/call-token
 * The core LiveKit security gate (spec section 36): verifies the
 * caller is a participant, the interview is in a joinable state, and
 * the current time is within the allowed join window — only then is
 * a token generated. Guessing a room name gets you nowhere without
 * passing all three checks first.
 */
const getCallToken = asyncHandler(async (req, res) => {
  const interview = await interviewService.assertParticipant(req.params.id, req.user.id);

  if (!['video', 'audio'].includes(interview.interview_type)) {
    throw new AppError('This interview does not use audio/video calling.', 400, 'WRONG_INTERVIEW_TYPE');
  }
  if (!['scheduled', 'in_progress'].includes(interview.status)) {
    throw new AppError(`Cannot join an interview with status "${interview.status}".`, 400, 'NOT_JOINABLE');
  }

  const now = Date.now();
  const startTime = new Date(interview.scheduled_start_at).getTime();
  const windowStart = startTime - JOIN_WINDOW_MINUTES_BEFORE * 60 * 1000;
  const windowEnd = startTime + interview.duration_minutes * 60 * 1000 + 15 * 60 * 1000; // 15 min grace after scheduled end
  if (now < windowStart || now > windowEnd) {
    throw new AppError('This interview is not currently joinable. Please check the scheduled time.', 400, 'OUTSIDE_JOIN_WINDOW');
  }

  const token = await livekitService.createInterviewAccessToken({
    interviewId: interview.id,
    userId: req.user.id,
    displayName: req.user.fullName || req.user.id,
  });

  await interviewService.recordJoin(interview.id, req.user.id);

  const otherUserId = req.user.id === interview.worker_user_id ? interview.hirer_user_id : interview.worker_user_id;
  const otherParticipant = await userSummaryService.getCallDisplaySummary(otherUserId);

  res.status(200).json({ ...token, callType: interview.interview_type, otherParticipant });
});

const leaveCall = asyncHandler(async (req, res) => {
  await interviewService.assertParticipant(req.params.id, req.user.id);
  await interviewService.recordLeave(req.params.id, req.user.id);
  res.status(200).json({ message: 'Left the call.' });
});

// --- Questions (hirer-only) ---
const listQuestions = asyncHandler(async (req, res) => {
  const questions = await questionService.listQuestions(req.params.id, req.user.id);
  res.status(200).json({ questions });
});
const addQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.addQuestion(req.params.id, req.user.id, req.body);
  res.status(201).json({ question });
});
const updateQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.updateQuestion(req.params.id, req.params.questionId, req.user.id, req.body);
  res.status(200).json({ question });
});
const deleteQuestion = asyncHandler(async (req, res) => {
  await questionService.deleteQuestion(req.params.id, req.params.questionId, req.user.id);
  res.status(200).json({ message: 'Question deleted.' });
});

// --- Private notes (hirer-only) ---
const listNotes = asyncHandler(async (req, res) => {
  const notes = await noteService.listNotes(req.params.id, req.user.id);
  res.status(200).json({ notes });
});
const addNote = asyncHandler(async (req, res) => {
  const note = await noteService.addNote(req.params.id, req.user.id, req.body);
  res.status(201).json({ note });
});
const updateNote = asyncHandler(async (req, res) => {
  const note = await noteService.updateNote(req.params.id, req.params.noteId, req.user.id, req.body);
  res.status(200).json({ note });
});
const deleteNote = asyncHandler(async (req, res) => {
  await noteService.deleteNote(req.params.id, req.params.noteId, req.user.id);
  res.status(200).json({ message: 'Note deleted.' });
});

// --- Evaluation (hirer-only) ---
const getEvaluation = asyncHandler(async (req, res) => {
  const evaluation = await evaluationService.getEvaluation(req.params.id, req.user.id);
  res.status(200).json({ evaluation });
});
const submitEvaluation = asyncHandler(async (req, res) => {
  const evaluation = await evaluationService.submitEvaluation(req.params.id, req.user.id, req.body);
  res.status(200).json({ evaluation });
});

module.exports = {
  schedule,
  respond,
  requestReschedule,
  confirmReschedule,
  cancel,
  complete,
  noShow,
  listUpcoming,
  listPast,
  getById,
  getEvents,
  getCallToken,
  leaveCall,
  listQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  listNotes,
  addNote,
  updateNote,
  deleteNote,
  getEvaluation,
  submitEvaluation,
};
