import { supabase } from "@/lib/supabase";
import { restrictionToastMessage } from "@/screens/diggle/utils/sanctionMessages";

export type AccountAccess = {
  status: "active" | "warning" | "community_restricted" | "suspended";
  restrictedUntil: string | null;
  sanctionId: string | null;
  reasonCategory: keyof typeof SANCTION_REASON_LABELS | "underage" | null;
  noticeSeenAt: string | null;
};
export const SANCTION_REASON_LABELS = {
  abuse: "욕설, 비방, 인신 공격",
  spam: "스팸, 광고",
  inappropriate: "부적절한 콘텐츠",
  other: "기타 커뮤니티 이용정책 위반",
};

export function parseAccountAccess(value: unknown): AccountAccess {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_account_access");
  const row = value as Record<string, unknown>;
  if (
    !["active", "warning", "community_restricted", "suspended"].includes(String(row.status)) ||
    (row.restricted_until != null &&
      (typeof row.restricted_until !== "string" ||
        !Number.isFinite(Date.parse(row.restricted_until)))) ||
    (row.sanction_id != null &&
      (typeof row.sanction_id !== "string" || !/^\d+$/.test(row.sanction_id))) ||
    (row.reason_category != null &&
      row.reason_category !== "underage" &&
      !Object.hasOwn(SANCTION_REASON_LABELS, String(row.reason_category))) ||
    (row.notice_seen_at != null &&
      (typeof row.notice_seen_at !== "string" || !Number.isFinite(Date.parse(row.notice_seen_at))))
  )
    throw new Error("invalid_account_access");
  if (row.status === "community_restricted" && row.restricted_until == null)
    throw new Error("invalid_account_access");
  return {
    status: row.status as AccountAccess["status"],
    restrictedUntil: (row.restricted_until as string | null) ?? null,
    sanctionId: (row.sanction_id as string | null) ?? null,
    reasonCategory: (row.reason_category as AccountAccess["reasonCategory"]) ?? null,
    noticeSeenAt: (row.notice_seen_at as string | null) ?? null,
  };
}

export async function fetchAccountAccess(accessToken?: string) {
  const query = supabase.rpc("get_account_access");
  if (accessToken) query.setHeader("Authorization", `Bearer ${accessToken}`);
  const { data, error } = await query;
  if (error) throw error;
  return parseAccountAccess(data);
}
export async function acknowledgeSanction(sanctionId: string) {
  if (!/^\d+$/.test(sanctionId) || !Number.isSafeInteger(Number(sanctionId)))
    throw new Error("invalid_sanction_id");
  const { error } = await supabase.rpc("acknowledge_sanction_notice", {
    sanction_id: Number(sanctionId),
  });
  if (error) throw error;
}

export async function ensureCommunityWriteAllowed() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("not_authenticated");
  const access = await fetchAccountAccess(session.access_token);
  if (access.status === "suspended")
    throw Object.assign(new Error("suspended"), { details: JSON.stringify(access) });
  if (access.status === "community_restricted")
    throw Object.assign(new Error("community_restricted"), {
      details: JSON.stringify({ restricted_until: access.restrictedUntil }),
    });
  return session.access_token;
}

export function restrictionMessage(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("message" in error) ||
    error.message !== "community_restricted"
  )
    return null;
  try {
    const details =
      "details" in error && typeof error.details === "string" ? JSON.parse(error.details) : {};
    return restrictionToastMessage(
      typeof details.restricted_until === "string" ? details.restricted_until : "",
    );
  } catch {
    return restrictionToastMessage("");
  }
}
