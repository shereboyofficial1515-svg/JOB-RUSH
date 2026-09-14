/**
 * Supabase client for Storage only. Uses the SERVICE ROLE key, which
 * bypasses bucket policies — this file must NEVER be imported by
 * anything that runs in or ships to the frontend, and the key itself
 * must never leave the server process.
 */
const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

let client = null;

function getSupabaseClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured before using Storage.'
    );
  }
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

module.exports = { getSupabaseClient };
