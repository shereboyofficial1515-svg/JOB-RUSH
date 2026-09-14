const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const interviewService = require('./interviewService');

/** Ensures the caller is specifically the hirer on this interview. */
async function assertHirer(interviewId, hirerUserId) {
  const interview = await interviewService.assertParticipant(interviewId, hirerUserId);
  if (interview.caller_role !== 'hirer') {
    throw new AppError('Only the hirer can manage interview questions.', 403, 'FORBIDDEN');
  }
  return interview;
}

async function listQuestions(interviewId, hirerUserId) {
  await assertHirer(interviewId, hirerUserId); // prep material stays hirer-side by default
  const { rows } = await query(
    'SELECT * FROM interview_questions WHERE interview_id = $1 ORDER BY sort_order, created_at',
    [interviewId]
  );
  return rows;
}

async function addQuestion(interviewId, hirerUserId, { questionText, sortOrder }) {
  await assertHirer(interviewId, hirerUserId);
  const { rows } = await query(
    `INSERT INTO interview_questions (interview_id, question_text, sort_order) VALUES ($1, $2, $3) RETURNING *`,
    [interviewId, questionText, sortOrder ?? 0]
  );
  return rows[0];
}

async function updateQuestion(interviewId, questionId, hirerUserId, { questionText, sortOrder, isAnswered }) {
  await assertHirer(interviewId, hirerUserId);
  const { rows } = await query(
    `UPDATE interview_questions
        SET question_text = COALESCE($3, question_text),
            sort_order = COALESCE($4, sort_order),
            is_answered = COALESCE($5, is_answered)
      WHERE id = $1 AND interview_id = $2
      RETURNING *`,
    [questionId, interviewId, questionText, sortOrder, isAnswered]
  );
  if (rows.length === 0) throw new AppError('Question not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function deleteQuestion(interviewId, questionId, hirerUserId) {
  await assertHirer(interviewId, hirerUserId);
  await query('DELETE FROM interview_questions WHERE id = $1 AND interview_id = $2', [questionId, interviewId]);
}

module.exports = { listQuestions, addQuestion, updateQuestion, deleteQuestion };
