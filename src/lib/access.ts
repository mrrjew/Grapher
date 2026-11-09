import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasSemesterPass(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("has_semester_pass");
  if (error) throw new Error("Access check is unavailable.");
  return data === true;
}
