"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type SystemHealthPayload = {
  rtc: {
    iceServersCount: number;
    hasTurnServer: boolean;
    hasRtcEnv: boolean;
    note: string;
  };
  environment: {
    nodeEnv: string;
    testRoutesProductionGuarded: boolean;
    testFixtureSecretConfigured: boolean;
  };
  recentActivity: {
    latestLiveRoomAt: string | null;
    latestPrivateSessionAt: string | null;
    latestDmMessageAt: string | null;
    latestGiftAt: string | null;
    latestWalletAdjustmentAt: string | null;
    latestWithdrawalAt: string | null;
  };
  counts: {
    liveRooms: number;
    activePrivateSessions: number;
    pendingPrivateRequests: number;
    pendingWithdrawals: number;
  };
  realtimeTables: Array<{ name: string; expected: boolean; note: string }>;
  limitations: string[];
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) {
    return "—";
  }
  return new Date(t).toLocaleString("tr-TR");
}

function isPayload(body: unknown): body is SystemHealthPayload {
  if (!body || typeof body !== "object") {
    return false;
  }
  const o = body as Record<string, unknown>;
  return (
    typeof o.rtc === "object" &&
    o.rtc !== null &&
    typeof o.environment === "object" &&
    o.environment !== null &&
    typeof o.recentActivity === "object" &&
    o.recentActivity !== null &&
    typeof o.counts === "object" &&
    o.counts !== null &&
    Array.isArray(o.realtimeTables) &&
    Array.isArray(o.limitations)
  );
}

export default function AdminSystemHealthPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<SystemHealthPayload | null>(null);

  const loadHealth = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoadState("error");
        setErrorMessage("Oturum bulunamadı.");
        setData(null);
        return;
      }

      const res = await fetch("/api/admin/system-health", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body: unknown = await res.json();
      if (!res.ok || !isPayload(body)) {
        const msg =
          body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
            ? (body as { message: string }).message
            : "Sistem sağlığı yüklenemedi.";
        setLoadState("error");
        setErrorMessage(msg);
        setData(null);
        return;
      }
      setData(body);
      setLoadState("idle");
    } catch {
      setLoadState("error");
      setErrorMessage("Sistem sağlığı yüklenemedi.");
      setData(null);
    }
  }, []);

  useEffect(() => {
    if (!authorized) {
      return;
    }
    void loadHealth();
  }, [authorized, loadHealth]);

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  const rtc = data?.rtc;
  const env = data?.environment;
  const recent = data?.recentActivity;
  const counts = data?.counts;

  return (
    <AdminLayout
      title="Sistem Sağlığı"
      description="Canlı yayın, özel oda, DM ve finans altyapısının temel durumunu buradan kontrol edebilirsin."
      onLogout={signOut}
    >
      <div data-testid="admin-system-health-page" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-white p-4 shadow-sm sm:p-5">
          <button
            type="button"
            data-testid="admin-system-health-refresh"
            onClick={() => void loadHealth()}
            disabled={loadState === "loading"}
            className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
          >
            Yenile
          </button>
          {loadState === "loading" ? (
            <span className="text-sm text-slate-600">Yükleniyor…</span>
          ) : null}
        </div>

        {loadState === "error" && errorMessage ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p>
        ) : null}

        <section
          data-testid="admin-system-health-rtc"
          className="rounded-3xl bg-white p-5 shadow-sm"
          aria-labelledby="admin-system-health-rtc-heading"
        >
          <h2 id="admin-system-health-rtc-heading" className="text-lg font-semibold text-indigo-800">
            RTC / Bağlantı
          </h2>
          <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">ICE sunucu sayısı</dt>
              <dd className="font-medium">{rtc?.iceServersCount ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">TURN yapılandırıldı mı?</dt>
              <dd className="font-medium">{rtc ? (rtc.hasTurnServer ? "Evet" : "Hayır") : "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">RTC env tanımlı mı?</dt>
              <dd className="font-medium">{rtc ? (rtc.hasRtcEnv ? "Evet" : "Hayır") : "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Not</dt>
              <dd className="font-medium">{rtc?.note ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section
          data-testid="admin-system-health-environment"
          className="rounded-3xl bg-white p-5 shadow-sm"
          aria-labelledby="admin-system-health-env-heading"
        >
          <h2 id="admin-system-health-env-heading" className="text-lg font-semibold text-indigo-800">
            Ortam ve güvenlik
          </h2>
          <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">NODE_ENV</dt>
              <dd className="font-medium">{env?.nodeEnv ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">TEST_FIXTURE_SECRET</dt>
              <dd className="font-medium">
                {env ? (env.testFixtureSecretConfigured ? "Tanımlı" : "Tanımlı değil") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Test route production guard</dt>
              <dd className="font-medium">{env?.testRoutesProductionGuarded ? "Aktif" : "—"}</dd>
            </div>
            <div className="sm:col-span-2 rounded-2xl bg-slate-50 px-3 py-2 text-slate-600">
              Service role veya gizli anahtarlar bu ekranda gösterilmez. Sunucu tarafı kullanımlar için deploy
              checklist’inde service role sızıntısı ve RLS denetimi yapılmalıdır.
            </div>
          </dl>
        </section>

        <section
          data-testid="admin-system-health-recent-activity"
          className="rounded-3xl bg-white p-5 shadow-sm"
          aria-labelledby="admin-system-health-recent-heading"
        >
          <h2 id="admin-system-health-recent-heading" className="text-lg font-semibold text-indigo-800">
            Son aktiviteler
          </h2>
          <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Son canlı oda güncellemesi</dt>
              <dd className="font-medium">{formatDateTime(recent?.latestLiveRoomAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Son özel oda oturumu</dt>
              <dd className="font-medium">{formatDateTime(recent?.latestPrivateSessionAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Son DM mesajı</dt>
              <dd className="font-medium">{formatDateTime(recent?.latestDmMessageAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Son hediye</dt>
              <dd className="font-medium">{formatDateTime(recent?.latestGiftAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Son cüzdan hareketi</dt>
              <dd className="font-medium">{formatDateTime(recent?.latestWalletAdjustmentAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Son çekim talebi</dt>
              <dd className="font-medium">{formatDateTime(recent?.latestWithdrawalAt ?? null)}</dd>
            </div>
          </dl>
        </section>

        <section
          data-testid="admin-system-health-counts"
          className="rounded-3xl bg-white p-5 shadow-sm"
          aria-labelledby="admin-system-health-counts-heading"
        >
          <h2 id="admin-system-health-counts-heading" className="text-lg font-semibold text-indigo-800">
            Anlık sayılar
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Canlı oda</dt>
              <dd className="mt-1 text-2xl font-bold text-indigo-800">{counts?.liveRooms ?? "—"}</dd>
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Aktif özel oda</dt>
              <dd className="mt-1 text-2xl font-bold text-indigo-800">{counts?.activePrivateSessions ?? "—"}</dd>
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Bekleyen özel oda talebi</dt>
              <dd className="mt-1 text-2xl font-bold text-indigo-800">{counts?.pendingPrivateRequests ?? "—"}</dd>
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Bekleyen çekim talebi</dt>
              <dd className="mt-1 text-2xl font-bold text-indigo-800">{counts?.pendingWithdrawals ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section
          data-testid="admin-system-health-realtime"
          className="rounded-3xl bg-white p-5 shadow-sm"
          aria-labelledby="admin-system-health-realtime-heading"
        >
          <h2 id="admin-system-health-realtime-heading" className="text-lg font-semibold text-indigo-800">
            Realtime tabloları (beklenti)
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Supabase publication doğrulaması bu fazda zorunlu değil; aşağıdaki tablolar ürün için beklenen listedir.
          </p>
          <ul className="mt-4 divide-y divide-cyan-100 text-sm">
            {(data?.realtimeTables ?? []).map((row) => (
              <li key={row.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-mono font-semibold text-slate-800">{row.name}</span>
                <span className="text-slate-600">{row.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          data-testid="admin-system-health-limitations"
          className="rounded-3xl bg-white p-5 shadow-sm"
          aria-labelledby="admin-system-health-limitations-heading"
        >
          <h2 id="admin-system-health-limitations-heading" className="text-lg font-semibold text-indigo-800">
            Bilinen limitasyonlar
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {(data?.limitations ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
    </AdminLayout>
  );
}
