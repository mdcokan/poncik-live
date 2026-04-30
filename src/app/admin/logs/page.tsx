"use client";

import { useEffect, useState } from "react";
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

export default function AdminLogsPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [actionTypeInput, setActionTypeInput] = useState("");
  const [activeActionType, setActiveActionType] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error"; message: string } | null>(null);

  async function loadLogs(nextActionType: string) {
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
      const trimmedActionType = nextActionType.trim();
      if (trimmedActionType) {
        params.set("actionType", trimmedActionType);
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
    void loadLogs(activeActionType);
  }, [authorized, activeActionType]);

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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={actionTypeInput}
            onChange={(event) => setActionTypeInput(event.target.value)}
            placeholder="Action type filtrele (örnek: user_banned)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 sm:max-w-md"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveActionType(actionTypeInput)}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Uygula
            </button>
            <button
              type="button"
              onClick={() => {
                void loadLogs(activeActionType);
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Yenile
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
                    <p className="font-semibold text-slate-800">{log.adminName}</p>
                    <p className="text-xs text-slate-500">{log.adminId}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{log.actionType}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {log.targetUserId ? (
                      <>
                        <p className="font-semibold text-slate-800">{log.targetUserName ?? "Uye"}</p>
                        <p className="text-xs text-slate-500">{log.targetUserId}</p>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{log.description}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{summarizeMetadata(log.metadata)}</td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr className="border-t border-cyan-100">
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>
                    {isFetching ? "İşlem kayıtları yükleniyor..." : "Henüz işlem kaydı yok."}
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
