import { NextResponse } from "next/server";
import { fetchLiveRooms } from "@/lib/live-rooms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedLimit = Number(searchParams.get("limit") ?? "24");
  const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 24;
  const { rooms } = await fetchLiveRooms(safeLimit);

  return NextResponse.json(
    { rooms },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
