import { authenticatedUser } from "@/lib/supabase";
import {
  apiError,
  HttpError,
  jsonReply,
  requireSameOrigin,
  validId,
} from "@/lib/http";
import { graphFromRow } from "@/lib/saved-graphs";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!validId(id)) throw new HttpError("This graph was not found.", 404);
    const auth = await authenticatedUser();
    if (!auth)
      throw new HttpError("Your session has ended. Log in again.", 401);
    const { data, error } = await auth.client
      .from("graphs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Graph load failed.");
    if (!data)
      throw new HttpError(
        "This graph is not available to your account or current pass.",
        404,
      );
    return jsonReply({ id, draft: graphFromRow(data) });
  } catch (error) {
    return apiError(error, "graph_load");
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    if (!validId(id)) throw new HttpError("This graph was not found.", 404);
    const auth = await authenticatedUser();
    if (!auth)
      throw new HttpError("Your session has ended. Log in again.", 401);
    await rateLimit(request, "graph-save", auth.user.id);
    const { error } = await auth.client.from("graphs").delete().eq("id", id);
    if (error) throw new Error("Graph delete failed.");
    return jsonReply({
      message: "Saved graph deleted. Your current table is still here.",
    });
  } catch (error) {
    return apiError(error, "graph_delete");
  }
}
