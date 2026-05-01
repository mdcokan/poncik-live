import { noStoreJson, requireAuthedUser } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ConversationRow = {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string | null;
  updated_at: string;
};

type MessageRow = {
  conversation_id: string;
  body: string;
  created_at: string;
};

type UnreadRow = {
  conversation_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string;
};

export async function GET(request: Request) {
  const auth = await requireAuthedUser(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { user, supabase } = auth;

  const { data: convRows, error: convError } = await supabase
    .from("dm_conversations")
    .select("id, participant_a, participant_b, last_message_at, updated_at")
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
    .limit(80);

  if (convError) {
    return noStoreJson({ ok: false, message: "Sohbetler yüklenemedi." }, { status: 500 });
  }

  const conversations = (convRows ?? []) as ConversationRow[];
  conversations.sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    if (ta !== tb) {
      return tb - ta;
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const limited = conversations.slice(0, 50);
  const convIds = limited.map((c) => c.id);
  if (convIds.length === 0) {
    return noStoreJson({ ok: true, conversations: [] });
  }

  const otherIds = limited.map((c) => (c.participant_a === user.id ? c.participant_b : c.participant_a));
  const uniqueOtherIds = Array.from(new Set(otherIds));

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .in("id", uniqueOtherIds);

  if (profileError) {
    return noStoreJson({ ok: false, message: "Sohbetler yüklenemedi." }, { status: 500 });
  }

  const profileById = new Map((profileRows as ProfileRow[] | null)?.map((p) => [p.id, p]) ?? []);

  const { data: messageRows, error: msgError } = await supabase
    .from("dm_messages")
    .select("conversation_id, body, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (msgError) {
    return noStoreJson({ ok: false, message: "Sohbetler yüklenemedi." }, { status: 500 });
  }

  const lastPreviewByConv = new Map<string, { preview: string; at: string }>();
  for (const m of (messageRows ?? []) as MessageRow[]) {
    if (lastPreviewByConv.has(m.conversation_id)) {
      continue;
    }
    const text = m.body.trim();
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    lastPreviewByConv.set(m.conversation_id, { preview, at: m.created_at });
  }

  const { data: unreadRows, error: unreadError } = await supabase
    .from("dm_messages")
    .select("conversation_id")
    .in("conversation_id", convIds)
    .eq("receiver_id", user.id)
    .is("read_at", null);

  if (unreadError) {
    return noStoreJson({ ok: false, message: "Sohbetler yüklenemedi." }, { status: 500 });
  }

  const unreadByConv = new Map<string, number>();
  for (const r of (unreadRows ?? []) as UnreadRow[]) {
    unreadByConv.set(r.conversation_id, (unreadByConv.get(r.conversation_id) ?? 0) + 1);
  }

  const payload = limited.map((c) => {
    const otherId = c.participant_a === user.id ? c.participant_b : c.participant_a;
    const prof = profileById.get(otherId);
    const last = lastPreviewByConv.get(c.id);
    return {
      id: c.id,
      otherUserId: otherId,
      otherDisplayName: prof?.display_name?.trim() || "Kullanıcı",
      otherRole: prof?.role ?? "viewer",
      lastMessagePreview: last?.preview ?? "",
      lastMessageAt: last?.at ?? c.last_message_at ?? c.updated_at,
      unreadCount: unreadByConv.get(c.id) ?? 0,
    };
  });

  return noStoreJson({ ok: true, conversations: payload });
}
