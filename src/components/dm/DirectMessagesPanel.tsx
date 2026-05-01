"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export type DirectMessagesPanelProps = {
  currentUserRole: "viewer" | "streamer";
  initialTargetUserId?: string;
  compact?: boolean;
  banned?: boolean;
};

type ConversationSummary = {
  id: string;
  otherUserId: string;
  otherDisplayName: string;
  otherRole: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
};

type DmMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function roleLabel(role: string) {
  if (role === "streamer") {
    return "Yayıncı";
  }
  if (role === "admin" || role === "owner") {
    return "Yönetici";
  }
  return "Üye";
}

export function DirectMessagesPanel({
  currentUserRole,
  initialTargetUserId,
  compact,
  banned = false,
}: DirectMessagesPanelProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendBody, setSendBody] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [messagesError, setMessagesError] = useState("");
  const [sendError, setSendError] = useState("");
  const listBottomRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const padding = compact ? "p-3" : "p-4";

  const fetchAccessToken = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const loadConversations = useCallback(async () => {
    setListError("");
    setListLoading(true);
    try {
      const token = await fetchAccessToken();
      if (!token) {
        setConversations([]);
        setListError("Oturum bulunamadı.");
        return;
      }
      const response = await fetch("/api/dm/conversations", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        conversations?: ConversationSummary[];
        message?: string;
      };
      if (!response.ok || !payload.ok) {
        setConversations([]);
        setListError(payload.message ?? "Sohbetler yüklenemedi.");
        return;
      }
      setConversations(payload.conversations ?? []);
    } catch {
      setConversations([]);
      setListError("Sohbetler yüklenemedi.");
    } finally {
      setListLoading(false);
    }
  }, [fetchAccessToken]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setMessagesError("");
      setMessagesLoading(true);
      try {
        const token = await fetchAccessToken();
        if (!token) {
          setMessages([]);
          setMessagesError("Oturum bulunamadı.");
          return;
        }
        const response = await fetch(`/api/dm/conversations/${conversationId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          messages?: DmMessage[];
          message?: string;
        };
        if (!response.ok || !payload.ok) {
          setMessages([]);
          setMessagesError(payload.message ?? "Mesajlar yüklenemedi.");
          return;
        }
        setMessages(payload.messages ?? []);
      } catch {
        setMessages([]);
        setMessagesError("Mesajlar yüklenemedi.");
      } finally {
        setMessagesLoading(false);
      }
    },
    [fetchAccessToken],
  );

  useEffect(() => {
    let cancelled = false;
    async function resolveUser() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) {
        setCurrentUserId(user?.id ?? null);
      }
    }
    void resolveUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialTargetUserId || conversations.length === 0) {
      return;
    }
    const match = conversations.find((c) => c.otherUserId === initialTargetUserId);
    if (match) {
      setSelectedId(match.id);
    }
  }, [initialTargetUserId, conversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("dm-messages-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          const id = typeof raw.id === "string" ? raw.id : null;
          const conversationId = typeof raw.conversation_id === "string" ? raw.conversation_id : null;
          const senderId = typeof raw.sender_id === "string" ? raw.sender_id : null;
          const receiverId = typeof raw.receiver_id === "string" ? raw.receiver_id : null;
          const body = typeof raw.body === "string" ? raw.body : null;
          const createdAt = typeof raw.created_at === "string" ? raw.created_at : null;
          const readAt = raw.read_at === null || typeof raw.read_at === "string" ? (raw.read_at as string | null) : null;
          if (!id || !conversationId || !senderId || !receiverId || !body || !createdAt) {
            return;
          }
          void (async () => {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            const uid = user?.id;
            if (!uid || (senderId !== uid && receiverId !== uid)) {
              return;
            }
            const incoming: DmMessage = {
              id,
              conversationId,
              senderId,
              receiverId,
              body,
              createdAt,
              readAt,
            };
            setMessages((prev) => {
              if (conversationId !== selectedIdRef.current) {
                return prev;
              }
              if (prev.some((m) => m.id === id)) {
                return prev;
              }
              return [...prev, incoming];
            });
            void loadConversations();
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations]);

  useEffect(() => {
    listBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  async function handleSend() {
    if (banned || !selectedConversation) {
      return;
    }
    const trimmed = sendBody.trim();
    if (!trimmed) {
      setSendError("Mesaj boş olamaz.");
      return;
    }
    setSendBusy(true);
    setSendError("");
    try {
      const token = await fetchAccessToken();
      if (!token) {
        setSendError("Oturum bulunamadı.");
        return;
      }
      const response = await fetch("/api/dm/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: selectedConversation.otherUserId,
          body: trimmed,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setSendError(payload.message ?? "Mesaj gönderilemedi.");
        return;
      }
      setSendBody("");
      void loadMessages(selectedConversation.id);
      void loadConversations();
    } catch {
      setSendError("Mesaj gönderilemedi.");
    } finally {
      setSendBusy(false);
    }
  }

  const shellClass = compact
    ? "flex min-h-[320px] flex-col gap-3 md:flex-row md:items-stretch"
    : "flex min-h-[420px] flex-col gap-4 md:flex-row md:items-stretch";

  return (
    <div data-testid="dm-panel" data-dm-user-role={currentUserRole} className={shellClass}>
      <section
        data-testid="dm-conversation-list"
        className={`flex w-full flex-col rounded-2xl border border-violet-100/80 bg-violet-50/40 shadow-sm md:max-w-xs ${padding}`}
      >
        <h3 className="text-sm font-semibold text-indigo-800">Sohbetler</h3>
        {listLoading ? <p className="mt-2 text-xs text-slate-500">Yükleniyor...</p> : null}
        {listError ? (
          <p className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{listError}</p>
        ) : null}
        {!listLoading && !listError && conversations.length === 0 ? (
          <p data-testid="dm-empty-state" className="mt-3 text-sm text-slate-600">
            Henüz mesajlaşman yok.
          </p>
        ) : null}
        <ul className="mt-2 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {conversations.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid="dm-conversation-row"
                  onClick={() => setSelectedId(c.id)}
                  className={[
                    "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
                    active
                      ? "border-indigo-200 bg-white shadow-sm"
                      : "border-transparent bg-white/60 hover:border-indigo-100 hover:bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-800">{c.otherDisplayName}</span>
                    {c.unreadCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-pink-400 px-2 py-0.5 text-[10px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {roleLabel(c.otherRole)}
                  </p>
                  {c.lastMessagePreview ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{c.lastMessagePreview}</p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className={`flex min-w-0 flex-1 flex-col rounded-2xl border border-cyan-100/80 bg-cyan-50/30 shadow-sm ${padding}`}
      >
        <p data-testid="dm-warning" className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
          Mesajlaşmalarda telefon numarası, email, sosyal medya hesabı vb. paylaşmak yasaktır.
        </p>

        {!selectedConversation ? (
          <p data-testid="dm-empty-state" className="mt-6 flex-1 text-sm text-slate-600">
            Bir sohbet seçildiğinde mesajlar burada görünecek.
          </p>
        ) : null}

        {selectedConversation ? (
          <>
            <header className="mt-3 border-b border-cyan-100 pb-2">
              <p className="text-sm font-semibold text-indigo-800">{selectedConversation.otherDisplayName}</p>
              <p className="text-xs text-slate-500">{roleLabel(selectedConversation.otherRole)}</p>
            </header>

            {messagesLoading ? <p className="mt-3 text-xs text-slate-500">Mesajlar yükleniyor...</p> : null}
            {messagesError ? (
              <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{messagesError}</p>
            ) : null}

            <div data-testid="dm-message-list" className="mt-3 max-h-[320px] flex-1 space-y-2 overflow-y-auto pr-1">
              {messages.map((m) => {
                const mine = currentUserId !== null && m.senderId === currentUserId;
                return (
                  <div
                    key={m.id}
                    data-testid="dm-message-row"
                    className={[
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      mine ? "ml-auto bg-indigo-600 text-white" : "mr-auto border border-white bg-white text-slate-800",
                    ].join(" ")}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-indigo-100" : "text-slate-400"}`}>
                      {new Date(m.createdAt).toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              })}
              <div ref={listBottomRef} />
            </div>

            <div className="mt-3 border-t border-cyan-100 pt-3">
              {sendError ? <p className="mb-2 text-xs text-rose-600">{sendError}</p> : null}
              {banned ? (
                <p className="text-xs text-rose-700">Hesabınız kısıtlanmıştır; mesaj gönderemezsiniz.</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea
                    data-testid="dm-message-input"
                    value={sendBody}
                    onChange={(e) => setSendBody(e.target.value)}
                    maxLength={1000}
                    rows={compact ? 2 : 3}
                    placeholder="Mesajını yaz..."
                    className="min-h-[72px] w-full flex-1 resize-none rounded-2xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-300"
                  />
                  <button
                    type="button"
                    data-testid="dm-send-button"
                    disabled={sendBusy || !sendBody.trim()}
                    onClick={() => void handleSend()}
                    className="rounded-2xl bg-pink-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendBusy ? "Gönderiliyor..." : "Gönder"}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

export default DirectMessagesPanel;
