import { supabase } from "@/lib/supabase";

export type FirstVisitGuideKind = "all" | "folder" | "item-detail";

export async function fetchDismissedFirstVisitGuides(userId: string) {
  const { data, error } = await supabase.rpc("get_first_visit_guides", {
    target_user_id: userId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function dismissFirstVisitGuide(userId: string, kind: FirstVisitGuideKind) {
  const { error } = await supabase.rpc("dismiss_first_visit_guide", {
    target_user_id: userId,
    target_guide_kind: kind,
  });
  if (error) throw error;
}
