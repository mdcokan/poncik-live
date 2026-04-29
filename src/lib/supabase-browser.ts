"use client";

import { createClient } from "@supabase/supabase-js";

export const LIVE_ROOMS_BROADCAST_CHANNEL = "poncik-live-rooms-broadcast";
export const LIVE_ROOMS_CHANGED_EVENT = "live_rooms_changed";

export function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
