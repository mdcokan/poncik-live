import MemberPageClient from "./member-page-client";
import { fetchLiveRooms } from "@/lib/live-rooms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberPage() {
  const { rooms: liveRooms, hasError } = await fetchLiveRooms(24);
  return <MemberPageClient initialRooms={liveRooms} initialHasError={hasError} />;
}
