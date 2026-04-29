import { fetchLiveRooms } from "@/lib/live-rooms";
import HomePageClient from "./home-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { rooms: liveRooms, hasError } = await fetchLiveRooms(24);
  return <HomePageClient initialRooms={liveRooms} initialHasError={hasError} />;
}

