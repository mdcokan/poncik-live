"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fetchCurrentUserWallet } from "@/lib/wallets";

type UseWalletBalanceOptions = {
  initialBalance?: number | null;
};

export function useWalletBalance({ initialBalance = 0 }: UseWalletBalanceOptions = {}) {
  const [balance, setBalance] = useState<number>(initialBalance ?? 0);

  const fetchBalance = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const latestBalance = await fetchCurrentUserWallet(supabase);
    setBalance(latestBalance ?? 0);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (!user) {
        setBalance(0);
        return;
      }

      await fetchBalance();

      channel = supabase
        .channel(`public:wallets:user:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "wallets",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!active) {
              return;
            }

            if (payload.eventType === "DELETE") {
              setBalance(0);
              return;
            }

            const nextBalance = Number((payload.new as { balance?: unknown } | null)?.balance);
            if (Number.isFinite(nextBalance)) {
              setBalance(nextBalance);
              return;
            }

            void fetchBalance();
          },
        )
        .subscribe();

    }

    void setup();

    return () => {
      active = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [fetchBalance]);

  return balance;
}
