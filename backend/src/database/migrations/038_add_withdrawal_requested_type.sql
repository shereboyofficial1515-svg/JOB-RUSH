-- No notification existed for the initial withdrawal request itself
-- (only for the admin's later approve/reject decision) — added for
-- the "Withdrawal Request Received" confirmation email (spec 6.R).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'withdrawal_requested';
