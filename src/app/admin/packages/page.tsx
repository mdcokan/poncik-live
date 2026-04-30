"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminAccessState } from "@/app/admin/_components/admin-access-state";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { useAdminAccess } from "@/app/admin/_hooks/use-admin-access";
import { getSupabaseClient } from "@/app/admin/_lib/supabase";

type PackageType = "minute" | "duration";

type PurchasePackage = {
  id: string;
  type: PackageType;
  name: string;
  amount: number;
  price_try: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type PackageFormState = {
  name: string;
  type: PackageType;
  amount: string;
  price_try: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY_FORM: PackageFormState = {
  name: "",
  type: "minute",
  amount: "",
  price_try: "",
  sort_order: "0",
  is_active: true,
};

function typeLabel(type: PackageType) {
  return type === "minute" ? "Dakika" : "Sure";
}

function formatAmount(item: Pick<PurchasePackage, "type" | "amount">) {
  if (item.type === "minute") {
    return `${item.amount} dk`;
  }
  return `${item.amount} dakika sure`;
}

function buildPayload(form: PackageFormState) {
  const amount = Number.parseInt(form.amount, 10);
  const priceTry = Number.parseInt(form.price_try, 10);
  const sortOrder = Number.parseInt(form.sort_order, 10);

  if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(priceTry) || priceTry < 0) {
    return null;
  }

  return {
    name: form.name.trim(),
    type: form.type,
    amount,
    price_try: priceTry,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    is_active: form.is_active,
  };
}

function sortPackages(items: PurchasePackage[]) {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function AdminPackagesPage() {
  const { loading, authorized, message, signOut } = useAdminAccess();
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [createForm, setCreateForm] = useState<PackageFormState>(EMPTY_FORM);
  const [editFormById, setEditFormById] = useState<Record<string, PackageFormState>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const packageCount = useMemo(() => packages.length, [packages]);

  async function getAccessToken() {
    const supabase = getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  function buildEditState(items: PurchasePackage[]) {
    const nextState: Record<string, PackageFormState> = {};
    for (const item of items) {
      nextState[item.id] = {
        name: item.name,
        type: item.type,
        amount: String(item.amount),
        price_try: String(item.price_try),
        sort_order: String(item.sort_order),
        is_active: item.is_active,
      };
    }
    return nextState;
  }

  async function loadPackages() {
    setLoadingPackages(true);
    setFeedback(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadi. Tekrar giris yap." });
        setPackages([]);
        return;
      }

      const response = await fetch("/api/admin/packages", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const payload = (await response.json()) as { ok?: boolean; message?: string; packages?: PurchasePackage[] };
      if (!response.ok || !payload.ok) {
        setFeedback({ type: "error", message: payload.message || "Paketler yuklenemedi." });
        setPackages([]);
        return;
      }

      const nextPackages = payload.packages ?? [];
      setPackages(nextPackages);
      setEditFormById(buildEditState(nextPackages));
    } catch {
      setFeedback({ type: "error", message: "Paketler yuklenemedi." });
      setPackages([]);
    } finally {
      setLoadingPackages(false);
    }
  }

  useEffect(() => {
    if (!authorized) {
      return;
    }
    void loadPackages();
  }, [authorized]);

  async function createPackage() {
    const payload = buildPayload(createForm);
    if (!payload) {
      setFeedback({ type: "error", message: "Paket bilgileri gecersiz." });
      return;
    }

    try {
      setSubmittingId("create");
      setFeedback(null);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadi. Tekrar giris yap." });
        return;
      }

      const response = await fetch("/api/admin/packages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { ok?: boolean; message?: string; package?: PurchasePackage };
      if (!response.ok || !body.ok) {
        setFeedback({ type: "error", message: body.message || "Paket olusturulamadi." });
        return;
      }

      setCreateForm(EMPTY_FORM);
      setFeedback({ type: "success", message: "Yeni paket olusturuldu." });
      if (body.package) {
        const createdPackage = body.package;
        setPackages((previous) => sortPackages([createdPackage, ...previous.filter((item) => item.id !== createdPackage.id)]));
        setEditFormById((previous) => ({
          ...previous,
          [createdPackage.id]: {
            name: createdPackage.name,
            type: createdPackage.type,
            amount: String(createdPackage.amount),
            price_try: String(createdPackage.price_try),
            sort_order: String(createdPackage.sort_order),
            is_active: createdPackage.is_active,
          },
        }));
      } else {
        await loadPackages();
      }
    } catch {
      setFeedback({ type: "error", message: "Paket olusturulamadi." });
    } finally {
      setSubmittingId(null);
    }
  }

  async function updatePackage(id: string) {
    const draft = editFormById[id];
    if (!draft) {
      return;
    }

    const payload = buildPayload(draft);
    if (!payload) {
      setFeedback({ type: "error", message: "Paket bilgileri gecersiz." });
      return;
    }

    try {
      setSubmittingId(id);
      setFeedback(null);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadi. Tekrar giris yap." });
        return;
      }

      const response = await fetch(`/api/admin/packages/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string; package?: PurchasePackage };

      if (!response.ok || !body.ok) {
        setFeedback({ type: "error", message: body.message || "Paket guncellenemedi." });
        return;
      }

      setFeedback({ type: "success", message: "Paket guncellendi." });
      if (body.package) {
        const updatedPackage = body.package;
        setPackages((previous) => sortPackages(previous.map((item) => (item.id === updatedPackage.id ? updatedPackage : item))));
      } else {
        await loadPackages();
      }
    } catch {
      setFeedback({ type: "error", message: "Paket guncellenemedi." });
    } finally {
      setSubmittingId(null);
    }
  }

  async function setPackageActive(id: string, isActive: boolean) {
    try {
      setSubmittingId(id);
      setFeedback(null);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadi. Tekrar giris yap." });
        return;
      }

      const response = await fetch(`/api/admin/packages/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ is_active: isActive }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string; package?: PurchasePackage };

      if (!response.ok || !body.ok) {
        setFeedback({ type: "error", message: body.message || "Paket durumu guncellenemedi." });
        return;
      }

      setFeedback({ type: "success", message: isActive ? "Paket aktive edildi." : "Paket pasife alindi." });
      if (body.package) {
        const updatedPackage = body.package;
        setPackages((previous) => sortPackages(previous.map((item) => (item.id === updatedPackage.id ? updatedPackage : item))));
      } else {
        await loadPackages();
      }
    } catch {
      setFeedback({ type: "error", message: "Paket durumu guncellenemedi." });
    } finally {
      setSubmittingId(null);
    }
  }

  async function softDeletePackage(id: string) {
    try {
      setSubmittingId(id);
      setFeedback(null);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setFeedback({ type: "error", message: "Oturum bulunamadi. Tekrar giris yap." });
        return;
      }

      const response = await fetch(`/api/admin/packages/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const body = (await response.json()) as { ok?: boolean; message?: string; package?: PurchasePackage };

      if (!response.ok || !body.ok) {
        setFeedback({ type: "error", message: body.message || "Paket pasife alinamadi." });
        return;
      }

      setFeedback({ type: "success", message: "Paket pasife alindi." });
      if (body.package) {
        const updatedPackage = body.package;
        setPackages((previous) => sortPackages(previous.map((item) => (item.id === updatedPackage.id ? updatedPackage : item))));
      } else {
        await loadPackages();
      }
    } catch {
      setFeedback({ type: "error", message: "Paket pasife alinamadi." });
    } finally {
      setSubmittingId(null);
    }
  }

  if (loading || !authorized) {
    return <AdminAccessState loading={loading} authorized={authorized} message={message} />;
  }

  return (
    <AdminLayout
      title="Dakika / Sure Paketleri"
      description="Kullanicilarin satin alacagi dakika ve sure paketlerini buradan yonetin."
      onLogout={signOut}
    >
      {feedback ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-indigo-800">Yeni paket ekle</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            data-testid="package-create-name"
            type="text"
            placeholder="Paket adi"
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            className="rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
          />
          <select
            data-testid="package-create-type"
            value={createForm.type}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, type: event.target.value as PackageType }))}
            className="rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
          >
            <option value="minute">Dakika</option>
            <option value="duration">Sure</option>
          </select>
          <input
            data-testid="package-create-amount"
            type="number"
            min={1}
            placeholder="Miktar"
            value={createForm.amount}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, amount: event.target.value }))}
            className="rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
          />
          <input
            data-testid="package-create-price"
            type="number"
            min={0}
            placeholder="Fiyat TL"
            value={createForm.price_try}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, price_try: event.target.value }))}
            className="rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
          />
          <input
            data-testid="package-create-sort-order"
            type="number"
            placeholder="Sira"
            value={createForm.sort_order}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, sort_order: event.target.value }))}
            className="rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
          />
          <label className="flex items-center gap-2 rounded-xl border border-cyan-200 px-3 py-2 text-sm text-slate-700">
            <input
              data-testid="package-create-is-active"
              type="checkbox"
              checked={createForm.is_active}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            Aktif
          </label>
        </div>
        <button
          data-testid="package-create-submit"
          type="button"
          onClick={() => void createPackage()}
          disabled={submittingId === "create"}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          Paket Olustur
        </button>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-indigo-800">Paket listesi</h2>
          <p className="text-sm text-slate-500">{loadingPackages ? "Yukleniyor..." : `${packageCount} paket`}</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm" data-testid="packages-table">
            <thead>
              <tr className="text-slate-500">
                <th className="px-3 py-2 font-semibold">Ad</th>
                <th className="px-3 py-2 font-semibold">Tip</th>
                <th className="px-3 py-2 font-semibold">Miktar</th>
                <th className="px-3 py-2 font-semibold">Fiyat</th>
                <th className="px-3 py-2 font-semibold">Durum</th>
                <th className="px-3 py-2 font-semibold">Sira</th>
                <th className="px-3 py-2 font-semibold">Islem</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((item) => {
                const draft = editFormById[item.id];
                return (
                  <tr key={item.id} data-testid={`package-row-${item.id}`} className="border-t border-cyan-100 align-top">
                    <td className="px-3 py-3">
                      <input
                        data-testid={`package-name-${item.id}`}
                        type="text"
                        value={draft?.name ?? item.name}
                        onChange={(event) =>
                          setEditFormById((prev) => ({
                            ...prev,
                            [item.id]: { ...(prev[item.id] ?? EMPTY_FORM), name: event.target.value },
                          }))
                        }
                        className="w-full rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        data-testid={`package-type-${item.id}`}
                        value={draft?.type ?? item.type}
                        onChange={(event) =>
                          setEditFormById((prev) => ({
                            ...prev,
                            [item.id]: { ...(prev[item.id] ?? EMPTY_FORM), type: event.target.value as PackageType },
                          }))
                        }
                        className="rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
                      >
                        <option value="minute">Dakika</option>
                        <option value="duration">Sure</option>
                      </select>
                      <p className="mt-2 text-xs text-slate-500">{typeLabel(item.type)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        data-testid={`package-amount-${item.id}`}
                        type="number"
                        min={1}
                        value={draft?.amount ?? String(item.amount)}
                        onChange={(event) =>
                          setEditFormById((prev) => ({
                            ...prev,
                            [item.id]: { ...(prev[item.id] ?? EMPTY_FORM), amount: event.target.value },
                          }))
                        }
                        className="w-28 rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
                      />
                      <p className="mt-2 text-xs text-slate-500">{formatAmount(item)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        data-testid={`package-price-${item.id}`}
                        type="number"
                        min={0}
                        value={draft?.price_try ?? String(item.price_try)}
                        onChange={(event) =>
                          setEditFormById((prev) => ({
                            ...prev,
                            [item.id]: { ...(prev[item.id] ?? EMPTY_FORM), price_try: event.target.value },
                          }))
                        }
                        className="w-28 rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
                      />
                      <p className="mt-2 text-xs text-slate-500">{item.price_try} TL</p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        data-testid={`package-status-${item.id}`}
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          item.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.is_active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        data-testid={`package-sort-order-${item.id}`}
                        type="number"
                        value={draft?.sort_order ?? String(item.sort_order)}
                        onChange={(event) =>
                          setEditFormById((prev) => ({
                            ...prev,
                            [item.id]: { ...(prev[item.id] ?? EMPTY_FORM), sort_order: event.target.value },
                          }))
                        }
                        className="w-24 rounded-xl border border-cyan-200 px-3 py-2 text-sm outline-none"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          data-testid={`package-save-${item.id}`}
                          onClick={() => void updatePackage(item.id)}
                          disabled={submittingId === item.id}
                          className="rounded-xl bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-200 disabled:opacity-60"
                        >
                          Kaydet
                        </button>
                        <button
                          type="button"
                          data-testid={`package-toggle-${item.id}`}
                          onClick={() => void setPackageActive(item.id, !item.is_active)}
                          disabled={submittingId === item.id}
                          className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-200 disabled:opacity-60"
                        >
                          {item.is_active ? "Pasife Cek" : "Aktif Et"}
                        </button>
                        <button
                          type="button"
                          data-testid={`package-soft-delete-${item.id}`}
                          onClick={() => void softDeletePackage(item.id)}
                          disabled={submittingId === item.id || !item.is_active}
                          className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-200 disabled:opacity-60"
                        >
                          Pasife Al
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
