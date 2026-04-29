import { createClient } from "@supabase/supabase-js";

export type GiftCatalogItem = {
  id: string;
  code: string;
  name: string;
  emoji: string;
  price: number;
  sortOrder: number;
};

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase ortam degiskenleri eksik.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}

export async function fetchGiftCatalog(limit = 50): Promise<GiftCatalogItem[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("gift_catalog")
      .select("id, code, name, emoji, price, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("price", { ascending: true })
      .limit(safeLimit);

    if (error || !data) {
      return [];
    }

    return data.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      emoji: item.emoji,
      price: item.price,
      sortOrder: item.sort_order,
    }));
  } catch {
    return [];
  }
}
