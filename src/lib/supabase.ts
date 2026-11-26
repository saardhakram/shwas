import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://znjiyhfedmnweoycljys.supabase.co';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Fallback dummy client if keys are not provided yet in the environment
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey && supabasePublishableKey.length > 5,
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
  },
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
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
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

/**
 * Upserts user profile into public.profiles:
 * columns: id (uuid = auth user id), language (text), location (jsonb), family (jsonb), home (jsonb)
 */
export async function upsertProfile(profile: UserProfile): Promise<boolean> {
  // Always persist to localStorage first so app state works offline and synchronously
  localStorage.setItem('shwas_profile', JSON.stringify({ ...profile, onboardingCompleted: true }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('shwas-profile-updated'));
  }

  if (!isSupabaseConfigured) {
    return true;
  }

  try {
    let user = (await supabase.auth.getSession()).data.session?.user;
    if (!user) {
      const newUser = await initAnonymousAuth();
      if (newUser) user = newUser;
    }

    if (!user?.id) {
      console.warn('[Shwas] Anonymous user ID not available for profile upsert.');
      return false;
    }

    const payload = {
      id: user.id,
      language: profile.language || 'en',
      location: profile.location,
      family: profile.family,
      home: profile.home,
    };

    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('[Shwas] Notice on profile upsert:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[Shwas] Error during profile upsert:', err);
    return false;
  }
}

/**
 * Fetches the user profile from Supabase or localStorage fallback
 */
export async function fetchProfile(): Promise<UserProfile | null> {
  const local = localStorage.getItem('shwas_profile');
  let profile: UserProfile | null = local ? JSON.parse(local) : null;

  if (!isSupabaseConfigured) {
    return profile;
  }

  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.user?.id) return profile;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!error && data) {
      profile = {
        id: data.id,
        language: data.language,
        location: data.location,
        family: data.family,
        home: data.home,
        onboardingCompleted: true,
      };
      localStorage.setItem('shwas_profile', JSON.stringify(profile));
    }
  } catch (err) {
    console.warn('[Shwas] Notice fetching profile from Supabase:', err);
  }

  return profile;
}
