"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type RangeKey = "7d" | "30d" | "90d" | "all";
type StatusKey = "all" | "active" | "ended" | "cancelled";

const SUMMARY_CAP = 1000;

type ReportSummary = {
  totalSessions: number;
  activeSessions: number;
  endedSessions: number;
  totalDurationSeconds: number;
  totalChargedMinutes: number;
  totalViewerSpentMinutes: number;
  totalStreamerEarnedMinutes: number;
  totalPlatformFeeMinutes: number;
  pendingWithdrawalMinutes: number;
  approvedWithdrawalMinutes: number;
};

type ReportSession = {
  id: string;
  status: string;
  roomId: string;
  streamerId: string;
  streamerName: string;
  viewerId: string;
  viewerName: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  chargedMinutes: number;
  viewerSpentMinutes: number;
  streamerEarnedMinutes: number;
  platformFeeMinutes: number;
  endReason: string | null;
};

type TopStreamer = {
  streamerId: string;
  streamerName: string;
  sessionCount: number;
  earnedMinutes: number;
  platformFeeMinutes: number;
};

type ApiPayload = {
  ok?: boolean;
  message?: string;
  summary?: ReportSummary;
  sessions?: ReportSession[];
  topStreamers?: TopStreamer[];
};

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0 sn";
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) {
    return `${s} sn`;
  }
  return `${m} dk ${s} sn`;
}

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

function statusLabel(status: string) {
  if (status === "active") {
    return "Aktif";
  }
  if (status === "ended") {
    return "Kapandı";
  }
  if (status === "cancelled") {
    return "İptal";
  }
  return status;
}

export default function AdminPrivateRoomsPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [range, setRange] = useState<RangeKey>("30d");
  const [status, setStatus] = useState<StatusKey>("all");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [topStreamers, setTopStreamers] = useState<TopStreamer[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
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
        return;
      }

      const params = new URLSearchParams({
        range,
        status,
        limit: "50",
      });
      const res = await fetch(`/api/admin/private-room-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await res.json()) as ApiPayload;
      if (!res.ok || !body.ok) {
        setLoadState("error");
        setErrorMessage(body.message || "Rapor yüklenemedi.");
        setSummary(null);
        setSessions([]);
        setTopStreamers([]);
        return;
      }
      setSummary(body.summary ?? null);
      setSessions(body.sessions ?? []);
      setTopStreamers(body.topStreamers ?? []);
      setLoadState("idle");
    } catch {
      setLoadState("error");
      setErrorMessage("Rapor yüklenemedi.");
      setSummary(null);
      setSessions([]);
      setTopStreamers([]);
    }
  }, [range, status]);

  useEffect(() => {
    if (!authorized) {
      return;
    }
    void loadReports();
  }, [authorized, loadReports]);

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  const emptySessions = loadState !== "loading" && sessions.length === 0;

  return (
    <AdminLayout
      title="Özel Oda Raporları"
      description="Özel oda oturumlarını, dakika kullanımını ve yayıncı kazançlarını buradan takip edebilirsin."
      onLogout={signOut}
    >
      <div data-testid="admin-private-room-reports-page" className="space-y-4">
        <section className="flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4 shadow-sm sm:p-5">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Dönem</span>
            <select
              data-testid="admin-private-room-range-select"
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-slate-800 outline-none"
            >
              <option value="7d">Son 7 gün</option>
              <option value="30d">Son 30 gün</option>
              <option value="90d">Son 90 gün</option>
              <option value="all">Tümü</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Durum</span>
            <select
              data-testid="admin-private-room-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusKey)}
              className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-slate-800 outline-none"
            >
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="ended">Kapandı</option>
              <option value="cancelled">İptal</option>
            </select>
          </label>
          <button
            type="button"
            data-testid="admin-private-room-refresh-button"
            onClick={() => void loadReports()}
            disabled={loadState === "loading"}
            className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
          >
            Yenile
          </button>
        </section>

        {loadState === "error" && errorMessage ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p>
        ) : null}

        {loadState === "loading" ? (
          <p className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-indigo-700">Yükleniyor…</p>
        ) : null}

        <section
          data-testid="admin-private-room-summary"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        >
          <article className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Toplam oturum</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{summary?.totalSessions ?? 0}</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Aktif oturum</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{summary?.activeSessions ?? 0}</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Harcanan toplam dakika</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{summary?.totalViewerSpentMinutes ?? 0} dk</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Yayıncı kazancı</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{summary?.totalStreamerEarnedMinutes ?? 0} dk</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Platform payı</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{summary?.totalPlatformFeeMinutes ?? 0} dk</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bekleyen çekim</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{summary?.pendingWithdrawalMinutes ?? 0} dk</p>
          </article>
          <article className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Onaylanan çekim</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{summary?.approvedWithdrawalMinutes ?? 0} dk</p>
          </article>
        </section>

        <section data-testid="admin-private-room-sessions" className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">Son özel oda oturumları</h2>
          <p className="mt-1 text-sm text-slate-500">Seçilen filtrelere göre en fazla 50 kayıt.</p>
          {emptySessions ? (
            <p className="mt-4 text-sm text-slate-500">Bu filtrelerle özel oda kaydı bulunamadı.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="px-3 py-2 font-semibold">Yayıncı</th>
                    <th className="px-3 py-2 font-semibold">Üye</th>
                    <th className="px-3 py-2 font-semibold">Durum</th>
                    <th className="px-3 py-2 font-semibold">Başlangıç / bitiş</th>
                    <th className="px-3 py-2 font-semibold">Süre</th>
                    <th className="px-3 py-2 font-semibold">Harcanan dk</th>
                    <th className="px-3 py-2 font-semibold">Yayıncı kazancı</th>
                    <th className="px-3 py-2 font-semibold">Platform payı</th>
                    <th className="px-3 py-2 font-semibold">Oda</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row) => (
                    <tr
                      key={row.id}
                      data-testid="admin-private-room-session-row"
                      className="border-t border-cyan-100 text-slate-700"
                    >
                      <td className="px-3 py-3 font-medium">{row.streamerName}</td>
                      <td className="px-3 py-3">{row.viewerName}</td>
                      <td className="px-3 py-3">{statusLabel(row.status)}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {formatDateTime(row.startedAt)}
                        <br />
                        {formatDateTime(row.endedAt)}
                      </td>
                      <td className="px-3 py-3">{formatDuration(row.durationSeconds)}</td>
                      <td className="px-3 py-3">{row.viewerSpentMinutes} dk</td>
                      <td className="px-3 py-3">{row.streamerEarnedMinutes} dk</td>
                      <td className="px-3 py-3">{row.platformFeeMinutes} dk</td>
                      <td className="px-3 py-3">
                        <Link href={`/rooms/${row.roomId}`} className="font-semibold text-indigo-600 underline">
                          /rooms/{row.roomId.slice(0, 8)}…
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section data-testid="admin-private-room-top-streamers" className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-800">En çok kazanan yayıncılar</h2>
          <p className="mt-1 text-sm text-slate-500">Seçilen dönem ve durum için özet (en çok {SUMMARY_CAP} oturum).</p>
          {topStreamers.length === 0 && loadState !== "loading" ? (
            <p className="mt-4 text-sm text-slate-500">Bu filtrelerle özel oda kaydı bulunamadı.</p>
          ) : (
            <ul className="mt-4 divide-y divide-cyan-100">
              {topStreamers.map((row) => (
                <li key={row.streamerId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="font-semibold text-slate-800">{row.streamerName}</span>
                  <span className="text-slate-600">{row.sessionCount} oturum</span>
                  <span className="text-indigo-700">{row.earnedMinutes} dk kazanç</span>
                  <span className="text-slate-500">Platform: {row.platformFeeMinutes} dk</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
