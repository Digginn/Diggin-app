import type { ReportReason, ReportTarget } from "@/constants/report";
import { supabase } from "@/lib/supabase";
import { normalizeText } from "@/utils/text";

import { databaseId } from "./community";

export async function reportCommunityContent(
  target: ReportTarget,
  reason: ReportReason,
  detail: string,
) {
  const { data, error } = await supabase.rpc("report_community_content", {
    target_type: target.type,
    target_id: databaseId(target.id),
    report_reason: reason,
    ...(reason === "other" ? { report_detail: normalizeText(detail).trim() } : {}),
  });
  if (error) throw error;
  if (typeof data !== "string" || !/^\d+$/.test(data)) throw new Error("invalid_report_response");
}

export async function blockCommunityAuthor(target: ReportTarget) {
  const { error } = await supabase.rpc("block_community_author", {
    target_type: target.type,
    target_id: databaseId(target.id),
  });
  if (error) throw error;
}
