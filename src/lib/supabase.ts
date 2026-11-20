import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://znjiyhfedmnweoycljys.supabase.co';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Fallback dummy client if keys are not provided yet in the environment
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabasePublishableKey && 
  supabasePublishableKey.length > 5
);

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabasePublishableKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Initializes anonymous authentication on app first load.
 * If user does not have an active session, sign them in as an anonymous guest.
 */
export async function initAnonymousAuth() {
  if (!isSupabaseConfigured) {
    console.info('[Shwas] Supabase publishable key not configured yet; continuing in guest mode.');
    return null;
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn('[Shwas] Error fetching session:', sessionError.message);
    }

    if (session) {
      return session.user;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('[Shwas] Anonymous auth notice:', error.message);
      return null;
    }

    return data.user;
  } catch (err) {
    console.warn('[Shwas] Supabase auth initialization handled gracefully:', err);
    return null;
  }
}
