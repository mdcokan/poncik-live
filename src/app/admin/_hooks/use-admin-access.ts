"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type AdminRole = "viewer" | "streamer" | "admin" | "owner";

type AccessState = {
  loading: boolean;
  authorized: boolean;
  message: string;
};

export function useAdminAccess() {
  const [state, setState] = useState<AccessState>({
    loading: true,
    authorized: false,
    message: "",
  });

  useEffect(() => {
    async function checkAccess() {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.href = "/login";
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single<{ role: AdminRole }>();

        if (profileError) {
          setState({
            loading: false,
            authorized: false,
            message: profileError.message,
          });
          return;
        }

        if (profile?.role === "admin" || profile?.role === "owner") {
          setState({
            loading: false,
            authorized: true,
            message: "",
          });
          return;
        }

        setState({
          loading: false,
          authorized: false,
          message: "Yetkisiz erisim",
        });
      } catch (error) {
        setState({
          loading: false,
          authorized: false,
          message: error instanceof Error ? error.message : "Beklenmeyen bir hata olustu.",
        });
      }
    }

    checkAccess();
  }, []);

  const signOut = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }, []);

  return { ...state, signOut };
}
