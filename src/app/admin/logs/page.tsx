"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type AdminLog = {
  id: string;
  actionType: string;
  description: string;
  adminId: string;
  adminName: string;
  targetUserId: string | null;
  targetUserName: string | null;
  targetRoomId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type LogsApiResponse = {
  ok?: boolean;
  message?: string;
  logs?: AdminLog[];
};

type LogFilters = {
  actionType: string;
  targetUserId: string;
  adminId: string;
  q: string;
};

const ACTION_TYPE_OPTIONS = [
  "",
  "user_banned",
  "user_unbanned",
  "user_role_changed",
  "live_room_closed",
  "wallet_minutes_added",
  "wallet_minutes_removed",
  "minute_order_approved",
  "minute_order_rejected",
  "room_user_muted",
  "room_user_unmuted",
  "room_user_kicked",
  "room_user_room_banned",
  "room_user_room_unbanned",
] as const;

const DEFAULT_FILTERS: LogFilters = {
  actionType: "",
  targetUserId: "",
  adminId: "",
  q: "",
};

function formatDateTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "-";
  }
  return new Date(timestamp).toLocaleString("tr-TR");
}

function summarizeMetadata(metadata: Record<string, unknown>) {
  try {
    const json = JSON.stringify(metadata);
    if (json.length <= 120) {
      return json;
    }
    return `${json.slice(0, 117)}...`;
  } catch {
    return "{}";
  }
}

function AdminLogsContent() {
  const searchParams = useSearchParams();
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [draftFilters, setDraftFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [activeFilters, setActiveFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [isFetching, setIsFetching] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error"; message: string } | null>(null);

  async function loadLogs(nextFilters: LogFilters) {
    if (!authorized) {
      return;
    }

    setIsFetching(true);
    setFeedback(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setLogs([]);
        setFeedback({ type: "error", message: "Oturum bulunamadı." });
        return;
      }

      const params = new URLSearchParams({ limit: "50" });
      const trimmedActionType = nextFilters.actionType.trim();
      const trimmedTargetUserId = nextFilters.targetUserId.trim();
      const trimmedAdminId = nextFilters.adminId.trim();
      const trimmedQuery = nextFilters.q.trim();

      if (trimmedActionType) {
        params.set("actionType", trimmedActionType);
      }
      if (trimmedTargetUserId) {
        params.set("targetUserId", trimmedTargetUserId);
      }
      if (trimmedAdminId) {
        params.set("adminId", trimmedAdminId);
      }
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      const response = await fetch(`/api/admin/logs?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as LogsApiResponse;
      if (!response.ok || !payload.ok) {
        setLogs([]);
        setFeedback({ type: "error", message: payload.message || "İşlem kayıtları yüklenemedi." });
        return;
      }

      setLogs(payload.logs ?? []);
    } catch {
      setLogs([]);
      setFeedback({ type: "error", message: "İşlem kayıtları yüklenemedi." });
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => {
    if (isInitialized) {
      return;
    }
    const initialFilters: LogFilters = {
      actionType: searchParams.get("actionType")?.trim() ?? "",
      targetUserId: searchParams.get("targetUserId")?.trim() ?? "",
      adminId: searchParams.get("adminId")?.trim() ?? "",
      q: searchParams.get("q")?.trim() ?? "",
    };
    setDraftFilters(initialFilters);
    setActiveFilters(initialFilters);
    setIsInitialized(true);
  }, [isInitialized, searchParams]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    void loadLogs(activeFilters);
  }, [activeFilters, authorized, isInitialized]);

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="İşlem Geçmişi"
      description="Admin ve owner işlemlerinin kayıtlarını buradan takip edebilirsin."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50/40 p-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              İşlem tipi
              <select
                value={draftFilters.actionType}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, actionType: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
              >
                <option value="">Tümü</option>
                {ACTION_TYPE_OPTIONS.filter((value) => value).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Hedef kullanıcı ID
              <input
                value={draftFilters.targetUserId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, targetUserId: event.target.value }))}
                placeholder="Hedef kullanıcı ID"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Admin ID
              <input
                value={draftFilters.adminId}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, adminId: event.target.value }))}
                placeholder="Admin ID (opsiyonel)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Arama
              <input
                value={draftFilters.q}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Açıklama veya işlem ara..."
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveFilters({ ...draftFilters })}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Yenile
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftFilters(DEFAULT_FILTERS);
                setActiveFilters(DEFAULT_FILTERS);
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Filtreleri temizle
            </button>
          </div>
        </div>

        {feedback ? (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{feedback.message}</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-3 py-2 font-semibold">Tarih</th>
                <th className="px-3 py-2 font-semibold">Admin</th>
                <th className="px-3 py-2 font-semibold">İşlem</th>
                <th className="px-3 py-2 font-semibold">Hedef kullanıcı</th>
                <th className="px-3 py-2 font-semibold">Açıklama</th>
                <th className="px-3 py-2 font-semibold">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-cyan-100">
                  <td className="px-3 py-3 text-slate-700">{formatDateTime(log.createdAt)}</td>
                  <td className="px-3 py-3 text-slate-700">
                    <Link href={`/admin/users/${log.adminId}`} className="font-semibold text-indigo-700 hover:text-indigo-600 hover:underline">
                      {log.adminName}
                    </Link>
                    <p className="text-xs text-slate-500">{log.adminId}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{log.actionType}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {log.targetUserId ? (
                      <>
                        <Link
                          href={`/admin/users/${log.targetUserId}`}
                          className="font-semibold text-indigo-700 hover:text-indigo-600 hover:underline"
                        >
                          {log.targetUserName ?? "Uye"}
                        </Link>
                        <p className="text-xs text-slate-500">{log.targetUserId}</p>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    <p>{log.description}</p>
                    {log.targetRoomId ? (
                      <Link href={`/rooms/${log.targetRoomId}`} className="mt-1 inline-block text-xs font-semibold text-cyan-700 hover:underline">
                        Odayı Aç
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{summarizeMetadata(log.metadata)}</td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr className="border-t border-cyan-100">
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>
                    {isFetching ? "İşlem kayıtları yükleniyor..." : "Bu filtrelerle işlem kaydı bulunamadı."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}

export default function AdminLogsPage() {
  return (
    <Suspense fallback={<AdminAccessState loading={true} authorized={false} message="" />}>
      <AdminLogsContent />
    </Suspense>
  );
}
