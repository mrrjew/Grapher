import { authenticatedUser } from "@/lib/supabase";
import {
  apiError,
  HttpError,
  jsonReply,
  readJson,
  requireSameOrigin,
  validId,
} from "@/lib/http";
import { graphForSave } from "@/lib/saved-graphs";
import { hasSemesterPass } from "@/lib/access";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const auth = await authenticatedUser();
    if (!auth)
      throw new HttpError("Your session has ended. Log in again.", 401);
    const paid = await hasSemesterPass(auth.client);
    const rawOffset = new URL(request.url).searchParams.get("offset") ?? "0";
    if (!/^\d{1,9}$/.test(rawOffset))
      throw new HttpError("Choose a valid page of saved graphs.");
    const offset = Number(rawOffset);
    const { data, error } = await auth.client
      .from("graphs")
      .select("id,title,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 20);
    if (error) throw new Error("Graph list unavailable.");
    return jsonReply({
      graphs: data.slice(0, 20),
      paid,
      nextOffset: data.length > 20 ? offset + 20 : null,
    });
  } catch (error) {
    return apiError(error, "graph_list");
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const auth = await authenticatedUser();
    if (!auth)
      throw new HttpError("Your session has ended. Log in again.", 401);
    await rateLimit(request, "graph-save", auth.user.id);
    const data = await readJson(request);
    if (!validId(data.id))
      throw new HttpError(
        "This graph needs a valid identifier. Refresh and try again.",
      );
    const draft = graphForSave(data.draft);
    // The RPC derives the owner, locks per account and checks the current pass.
    const saved = await auth.client.rpc("save_graph", {
      p_id: data.id,
      p_title: draft.title,
      p_x_label: draft.xLabel,
      p_x_unit: draft.xUnit,
      p_y_label: draft.yLabel,
      p_y_unit: draft.yUnit,
      p_rows: draft.rows,
      p_x_boxes: Number(draft.xBoxes),
      p_y_boxes: Number(draft.yBoxes),
    });
    if (saved.error) {
      if (saved.error.code === "54000")
        throw new HttpError(
          "Too many saves. Wait a little before trying again. Your table is still here.",
          429,
        );
      if (saved.error.code === "P0001")
        throw new HttpError(
          "Free accounts can keep one saved graph. Load and update it, delete it, or upgrade for more.",
          403,
        );
      if (saved.error.code === "42501")
        throw new HttpError(
          "You cannot change this graph. Log in again or load your own saved graph.",
          403,
        );
      if (saved.error.code === "22023" || saved.error.code === "23514")
        throw new HttpError(
          "Check your graph title, axis labels and numbers before saving.",
        );
      throw new Error("Graph save failed.");
    }
    return jsonReply({ id: saved.data });
  } catch (error) {
    return apiError(error, "graph_save");
  }
}
