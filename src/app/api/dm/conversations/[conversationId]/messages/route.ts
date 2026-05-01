import { noStoreJson, requireAuthedUser } from "../../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const auth = await requireAuthedUser(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { user, supabase } = auth;
  const { conversationId } = await context.params;

  const { data: conv, error: convError } = await supabase
    .from("dm_conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conv) {
    return noStoreJson({ ok: false, message: "Sohbet bulunamadı." }, { status: 404 });
  }

  const { data: msgRows, error: msgError } = await supabase
    .from("dm_messages")
    .select("id, conversation_id, sender_id, receiver_id, body, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (msgError) {
    return noStoreJson({ ok: false, message: "Mesajlar yüklenemedi." }, { status: 500 });
  }

  const ordered = ((msgRows ?? []) as MessageRow[]).slice().reverse();

  const { error: readError } = await supabase.rpc("mark_dm_conversation_read", {
    p_conversation_id: conversationId,
  });

  if (readError) {
    return noStoreJson({ ok: false, message: "Mesajlar işlenemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    messages: ordered.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      receiverId: m.receiver_id,
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
    })),
  });
}
