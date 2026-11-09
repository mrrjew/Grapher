import { configured } from "@/lib/config";
import { adminSupabase } from "@/lib/supabase";
import { jsonReply } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!configured()) return jsonReply({ status: "unavailable" }, 503);
    const { error } = await adminSupabase()
      .from("graphs")
      .select("id")
      .limit(0);
    return jsonReply(
      {
        status: error ? "unavailable" : "ok",
        checkedAt: new Date().toISOString(),
      },
      error ? 503 : 200,
    );
  } catch {
    return jsonReply(
      { status: "unavailable", checkedAt: new Date().toISOString() },
      503,
    );
  }
}
