import { noStoreJson, requireAuthedUser, resolveRpcErrorCode } from "../../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const auth = await requireAuthedUser(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { supabase } = auth;
  const { conversationId } = await context.params;

  const { data, error } = await supabase.rpc("mark_dm_conversation_read", {
    p_conversation_id: conversationId,
  });

  if (error) {
    const code = resolveRpcErrorCode(error);
    if (code === "AUTH_REQUIRED") {
      return noStoreJson({ ok: false, code, message: "Giriş yapmalısınız." }, { status: 401 });
    }
    if (code === "CONVERSATION_NOT_FOUND") {
      return noStoreJson({ ok: false, code, message: "Sohbet bulunamadı." }, { status: 404 });
    }
    return noStoreJson({ ok: false, code: code ?? "UNKNOWN", message: "Okundu işaretlenemedi." }, { status: 500 });
  }

  const updated = Array.isArray(data) && data[0] && typeof (data[0] as { updated_count?: unknown }).updated_count === "number"
    ? (data[0] as { updated_count: number }).updated_count
    : 0;

  return noStoreJson({ ok: true, updatedCount: updated });
}
