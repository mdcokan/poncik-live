"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type Role = "viewer" | "streamer" | "admin" | "owner";
type ManagedRole = "viewer" | "streamer" | "admin";

type AdminUser = {
  id: string;
  displayName: string;
  role: Role;
  isBanned: boolean;
  balance: number;
  updatedAt: string;
};

export default function AdminUsersPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, ManagedRole>>({});

  const loadUsers = useCallback(
    async (query: string) => {
      if (!authorized) {
        return;
      }

      setIsFetching(true);
      try {
        const supabase = getSupabaseClient();
        const [{ data: sessionData }, { data: userData }] = await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);
        const accessToken = sessionData.session?.access_token;
        setCurrentUserId(userData.user?.id ?? null);

        if (!accessToken) {
          setFeedback({ type: "error", text: "Oturum bulunamadı." });
          setUsers([]);
          return;
        }

        const params = new URLSearchParams({ limit: "50" });
        const trimmedQuery = query.trim();
        if (trimmedQuery) {
          params.set("q", trimmedQuery);
        }

        const response = await fetch(`/api/admin/users?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json()) as { ok?: boolean; users?: AdminUser[]; message?: string };
        if (!response.ok || !payload.ok) {
          setUsers([]);
          setFeedback({ type: "error", text: payload.message ?? "Kullanıcılar yüklenemedi." });
          return;
        }

        const fetchedUsers = payload.users ?? [];
        setUsers(fetchedUsers);
        setSelectedRoles((previous) => {
          const next = { ...previous };
          for (const row of fetchedUsers) {
            if (row.role !== "owner") {
              next[row.id] = (next[row.id] ?? row.role) as ManagedRole;
            }
          }
          return next;
        });
      } catch {
        setUsers([]);
        setFeedback({ type: "error", text: "Kullanıcılar yüklenemedi." });
      } finally {
        setIsFetching(false);
      }
    },
    [authorized],
  );

  useEffect(() => {
    void loadUsers(activeQuery);
  }, [activeQuery, loadUsers]);

  const summary = useMemo(() => {
    const streamerCount = users.filter((user) => user.role === "streamer").length;
    const bannedCount = users.filter((user) => user.isBanned).length;
    const totalBalance = users.reduce((sum, user) => sum + user.balance, 0);
    return {
      totalUsers: users.length,
      streamerCount,
      bannedCount,
      totalBalance,
    };
  }, [users]);

  async function runAction(targetUser: AdminUser, action: "ban" | "unban" | "set_role") {
    if (!authorized || pendingId) {
      return;
    }

    const nextRole = selectedRoles[targetUser.id];
    if (action === "set_role" && !nextRole) {
      setFeedback({ type: "error", text: "Rol seçimi gerekli." });
      return;
    }

    setPendingId(targetUser.id);
    setFeedback(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setFeedback({ type: "error", text: "Oturum bulunamadı." });
        return;
      }

      const response = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: targetUser.id,
          action,
          role: action === "set_role" ? nextRole : undefined,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setFeedback({ type: "error", text: payload.message ?? "İşlem yapılamadı." });
        return;
      }

      setFeedback({
        type: "success",
        text:
          action === "ban"
            ? "Kullanıcı banlandı."
            : action === "unban"
              ? "Kullanıcının banı kaldırıldı."
              : "Rol güncellendi.",
      });
      await loadUsers(activeQuery);
    } catch {
      setFeedback({ type: "error", text: "İşlem yapılamadı." });
    } finally {
      setPendingId(null);
    }
  }

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Kullanıcılar"
      description="Kullanıcı rolleri, dakika bakiyeleri ve erişim durumlarını buradan yönet."
      onLogout={signOut}
    >
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Kullanıcı ara"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 sm:max-w-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveQuery(searchInput)}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Ara
            </button>
            <button
              type="button"
              onClick={() => void loadUsers(activeQuery)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Yenile
            </button>
          </div>
        </div>

        {feedback ? (
          <p
            className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
            <p className="text-xs text-slate-500">Toplam listelenen kullanıcı</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{summary.totalUsers}</p>
          </article>
          <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
            <p className="text-xs text-slate-500">Yayıncı sayısı</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{summary.streamerCount}</p>
          </article>
          <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
            <p className="text-xs text-slate-500">Banlı kullanıcı sayısı</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{summary.bannedCount}</p>
          </article>
          <article className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
            <p className="text-xs text-slate-500">Toplam dakika bakiyesi</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{summary.totalBalance} dk</p>
          </article>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-3 py-2 font-semibold">Kullanıcı adı</th>
                <th className="px-3 py-2 font-semibold">Rol</th>
                <th className="px-3 py-2 font-semibold">Dakika bakiyesi</th>
                <th className="px-3 py-2 font-semibold">Durum</th>
                <th className="px-3 py-2 font-semibold">Güncellenme</th>
                <th className="px-3 py-2 font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {users.map((userRow) => {
                const isSelf = currentUserId === userRow.id;
                const isOwnerRow = userRow.role === "owner";
                const actionDisabled = pendingId === userRow.id || isOwnerRow || isSelf;
                return (
                  <tr key={userRow.id} className="border-t border-cyan-100">
                    <td className="px-3 py-3 text-slate-700">
                      <p className="font-semibold text-slate-800">{userRow.displayName}</p>
                      <p className="text-xs text-slate-500">{userRow.id}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{userRow.role}</td>
                    <td className="px-3 py-3 font-semibold text-indigo-700">{userRow.balance} dk</td>
                    <td className="px-3 py-3 text-slate-700">{userRow.isBanned ? "Banlı" : "Aktif"}</td>
                    <td className="px-3 py-3 text-slate-700">{new Date(userRow.updatedAt).toLocaleString("tr-TR")}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedRoles[userRow.id] ?? (userRow.role === "owner" ? "admin" : userRow.role)}
                          onChange={(event) =>
                            setSelectedRoles((previous) => ({
                              ...previous,
                              [userRow.id]: event.target.value as ManagedRole,
                            }))
                          }
                          disabled={isOwnerRow || isSelf}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        >
                          <option value="viewer">viewer</option>
                          <option value="streamer">streamer</option>
                          <option value="admin">admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void runAction(userRow, "set_role")}
                          disabled={actionDisabled}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Rolü Güncelle
                        </button>
                        <button
                          type="button"
                          onClick={() => void runAction(userRow, userRow.isBanned ? "unban" : "ban")}
                          disabled={actionDisabled}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {userRow.isBanned ? "Banı Kaldır" : "Banla"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr className="border-t border-cyan-100">
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>
                    {isFetching ? "Kullanıcılar yükleniyor..." : "Kullanıcı verisi bulunamadı."}
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
