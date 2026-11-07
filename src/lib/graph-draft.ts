import { readDraft, type GraphDraft } from "./graph-input";

export const draftKey = (userId: string) => `physics-graph-draft:v1:${userId}`;
export function loadDraft(userId: string): GraphDraft | null {
  const value = localStorage.getItem(draftKey(userId));
  return value ? readDraft(value) : null;
}
export function storeDraft(userId: string, draft: GraphDraft) {
  localStorage.setItem(draftKey(userId), JSON.stringify(draft));
}
export function clearDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* Logout/deletion must still proceed when storage is unavailable. */
  }
  window.dispatchEvent(
    new CustomEvent("physics-draft-cleared", { detail: userId }),
  );
}
