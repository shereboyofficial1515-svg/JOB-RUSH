const express = require('express');
const controller = require('../controllers/interviewController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const {
  validateBody,
  scheduleInterviewSchema,
  respondSchema,
  rescheduleRequestSchema,
  rescheduleConfirmSchema,
  cancelSchema,
  addQuestionSchema,
  updateQuestionSchema,
  addNoteSchema,
  updateNoteSchema,
  submitEvaluationSchema,
} = require('../validators/interviewValidators');

const router = express.Router();

router.use(authenticate);

// Dashboards
router.get('/upcoming', controller.listUpcoming);
router.get('/past', controller.listPast);

// Scheduling — hirer only (ownership of the job/application re-checked in the service)
router.post('/', requireRole('hirer'), validateBody(scheduleInterviewSchema), controller.schedule);

// Single interview — participant-checked inside the service either way
router.get('/:id', controller.getById);
router.get('/:id/events', controller.getEvents);

// Worker response to an invitation
router.post('/:id/respond', requireRole('worker'), validateBody(respondSchema), controller.respond);

// Either participant may request a reschedule; only the hirer confirms
router.post('/:id/reschedule/request', validateBody(rescheduleRequestSchema), controller.requestReschedule);
router.post('/:id/reschedule/confirm', requireRole('hirer'), validateBody(rescheduleConfirmSchema), controller.confirmReschedule);

// Either participant may cancel
router.post('/:id/cancel', validateBody(cancelSchema), controller.cancel);

// Hirer marks the outcome
router.post('/:id/complete', requireRole('hirer'), controller.complete);
router.post('/:id/no-show', requireRole('hirer'), controller.noShow);

// LiveKit call
router.get('/:id/call-token', controller.getCallToken);
router.post('/:id/leave', controller.leaveCall);

// Questions (hirer-only)
router.get('/:id/questions', requireRole('hirer'), controller.listQuestions);
router.post('/:id/questions', requireRole('hirer'), validateBody(addQuestionSchema), controller.addQuestion);
router.patch(
  '/:id/questions/:questionId',
  requireRole('hirer'),
  validateBody(updateQuestionSchema),
  controller.updateQuestion
);
router.delete('/:id/questions/:questionId', requireRole('hirer'), controller.deleteQuestion);

// Private notes (hirer-only)
router.get('/:id/notes', requireRole('hirer'), controller.listNotes);
router.post('/:id/notes', requireRole('hirer'), validateBody(addNoteSchema), controller.addNote);
router.patch('/:id/notes/:noteId', requireRole('hirer'), validateBody(updateNoteSchema), controller.updateNote);
router.delete('/:id/notes/:noteId', requireRole('hirer'), controller.deleteNote);

// Evaluation (hirer-only)
router.get('/:id/evaluation', requireRole('hirer'), controller.getEvaluation);
router.put('/:id/evaluation', requireRole('hirer'), validateBody(submitEvaluationSchema), controller.submitEvaluation);

module.exports = router;
