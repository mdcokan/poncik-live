import { fetchLiveRooms } from "@/lib/live-rooms";
import RoomsPageClient from "./rooms-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RoomsPage() {
  const { rooms: liveRooms, hasError } = await fetchLiveRooms(24);
  return <RoomsPageClient initialRooms={liveRooms} initialHasError={hasError} />;
}
