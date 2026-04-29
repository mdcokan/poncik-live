"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const LIVE_ROOMS_BROADCAST_CHANNEL = "poncik-live-rooms-broadcast";
export const LIVE_ROOMS_CHANGED_EVENT = "live_rooms_changed";
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
