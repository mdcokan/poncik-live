import { NextResponse } from "next/server";
import { fetchGiftCatalog } from "@/lib/gifts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const catalog = await fetchGiftCatalog(rawLimit);

  return NextResponse.json({ items: catalog });
}
