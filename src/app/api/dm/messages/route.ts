import { noStoreJson, requireAuthedUser, resolveRpcErrorCode } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SendDmRow = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
};

const ERROR_BY_CODE: Record<string, { status: number; message: string }> = {
  AUTH_REQUIRED: { status: 401, message: "Giriş yapmalısınız." },
  RECEIVER_NOT_FOUND: { status: 404, message: "Kullanıcı bulunamadı." },
  CANNOT_MESSAGE_SELF: { status: 400, message: "Kendinize mesaj gönderemezsiniz." },
  BANNED: { status: 403, message: "Hesabınız kısıtlanmıştır." },
  RECEIVER_UNAVAILABLE: { status: 409, message: "Bu kullanıcı şu anda mesaj alamıyor." },
  EMPTY_MESSAGE: { status: 400, message: "Mesaj boş olamaz." },
  MESSAGE_TOO_LONG: { status: 400, message: "Mesaj en fazla 1000 karakter olabilir." },
};

export async function POST(request: Request) {
  const auth = await requireAuthedUser(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { supabase } = auth;

  let body: { receiverId?: unknown; body?: unknown };
  try {
    body = (await request.json()) as { receiverId?: unknown; body?: unknown };
  } catch {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Mesaj gönderilemedi." }, { status: 400 });
  }

  const receiverId = typeof body.receiverId === "string" ? body.receiverId : "";
  const text = typeof body.body === "string" ? body.body : "";
  if (!receiverId) {
    return noStoreJson({ ok: false, code: "BAD_REQUEST", message: "Mesaj gönderilemedi." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("send_direct_message", {
    p_receiver_id: receiverId,
    p_body: text,
  });

  if (error) {
    const code = resolveRpcErrorCode(error);
    const mapped = code ? ERROR_BY_CODE[code] : null;
    return noStoreJson(
      {
        ok: false,
        code: code ?? "UNKNOWN_ERROR",
        message: mapped?.message ?? "Mesaj gönderilemedi.",
      },
      { status: mapped?.status ?? 500 },
    );
  }

  const row = Array.isArray(data) ? (data[0] as SendDmRow | undefined) : undefined;
  if (!row) {
    return noStoreJson({ ok: false, code: "UNKNOWN_ERROR", message: "Mesaj gönderilemedi." }, { status: 500 });
  }

  return noStoreJson({
    ok: true,
    message: {
      id: row.message_id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      body: row.body,
      createdAt: row.created_at,
    },
  });
}
