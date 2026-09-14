const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const interviewService = require('./interviewService');

/**
 * Every function here requires the caller to be the hirer on this
 * specific interview. There is deliberately no code path in this
 * file — or anywhere else in the codebase — that returns a note to
 * the worker being interviewed, no matter what ID they supply.
 */
async function assertHirer(interviewId, hirerUserId) {
  const interview = await interviewService.assertParticipant(interviewId, hirerUserId);
  if (interview.caller_role !== 'hirer') {
    throw new AppError('Private interview notes are only visible to the hirer.', 403, 'FORBIDDEN');
  }
  return interview;
}

async function listNotes(interviewId, hirerUserId) {
  await assertHirer(interviewId, hirerUserId);
  const { rows } = await query(
    'SELECT * FROM interview_notes WHERE interview_id = $1 ORDER BY created_at',
    [interviewId]
  );
  return rows;
}

async function addNote(interviewId, hirerUserId, { category, noteText }) {
  await assertHirer(interviewId, hirerUserId);
  const { rows } = await query(
    `INSERT INTO interview_notes (interview_id, hirer_user_id, category, note_text)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [interviewId, hirerUserId, category || null, noteText]
  );
  return rows[0];
}

async function updateNote(interviewId, noteId, hirerUserId, { category, noteText }) {
  await assertHirer(interviewId, hirerUserId);
  const { rows } = await query(
    `UPDATE interview_notes SET category = COALESCE($4, category), note_text = COALESCE($5, note_text)
      WHERE id = $1 AND interview_id = $2 AND hirer_user_id = $3
      RETURNING *`,
    [noteId, interviewId, hirerUserId, category, noteText]
  );
  if (rows.length === 0) throw new AppError('Note not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function deleteNote(interviewId, noteId, hirerUserId) {
  await assertHirer(interviewId, hirerUserId);
  await query('DELETE FROM interview_notes WHERE id = $1 AND interview_id = $2 AND hirer_user_id = $3', [
    noteId,
    interviewId,
    hirerUserId,
  ]);
}

module.exports = { listNotes, addNote, updateNote, deleteNote };
