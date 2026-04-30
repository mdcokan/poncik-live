import { NextResponse } from "next/server";
import { fetchPublicRoomState } from "@/lib/live-rooms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_: Request, context: { params: Promise<{ roomId?: string }> }) {
  const params = await context.params;
  const roomId = params.roomId?.trim();

  if (!roomId) {
    return NextResponse.json(
      {
        error: "ROOM_ID_REQUIRED",
      },
      { status: 400 },
    );
  }

  const roomState = await fetchPublicRoomState(roomId);
  if (!roomState) {
    return NextResponse.json(
      {
        error: "ROOM_NOT_FOUND",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(roomState, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
