import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export class AccessCheckError extends Error {
  constructor(public code: string) { super('Access check is unavailable.'); }
}

export async function hasSemesterPass(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("has_semester_pass");
  if (error) throw new AccessCheckError(error.code || 'service_unavailable');
  return data === true;
}

/** Page-only fallback. Protected actions must continue to use the strict check. */
export async function semesterAccessForPage(client: SupabaseClient) {
  try { return { available: true, paid: await hasSemesterPass(client) }; }
  catch (error) {
    console.warn('semester_access_unavailable', { code: error instanceof AccessCheckError ? error.code : 'service_unavailable' });
    return { available: false, paid: false };
  }
}
