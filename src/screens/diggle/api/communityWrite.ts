import { supabase } from "@/lib/supabase";

function productId(id: string) {
  const number = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(number) || number <= 0)
    throw new Error("invalid_product_id");
  return number;
}

export async function fetchCommunityPolicy() {
  const { data, error } = await supabase
    .from("profiles")
    .select("community_policy_agreed_at")
    .single();
  if (error) throw error;
  return data.community_policy_agreed_at !== null;
}

export async function agreeCommunityPolicy() {
  const { error } = await supabase.rpc("agree_community_policy");
  if (error) throw error;
}

export async function createCommunityPost(input: {
  type: "post" | "vote";
  body: string;
  productIds: string[];
  requestId: string;
}) {
  const { data, error } = await supabase.rpc("create_post", {
    post_kind: input.type,
    post_content: input.body.normalize("NFC"),
    product_ids: input.productIds.map(productId),
    request_id: input.requestId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !/^\d+$/.test(data))
    throw new Error("invalid_community_response");
  return data;
}

export async function deleteCommunityPost(id: string) {
  const { error } = await supabase.rpc("delete_community_post", { target_post_id: productId(id) });
  if (error) throw error;
}

export function communityWriteError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (/community_restricted|not_authorized/.test(message))
    return "현재 커뮤니티를 이용할 수 없습니다.";
  if (/community_policy_required/.test(message))
    return "커뮤니티 이용정책에 동의한 후 다시 시도해 주세요.";
  if (/invalid_post_products/.test(message))
    return "첨부한 아이템을 확인해 주세요. 삭제된 아이템은 다시 선택해 주세요.";
  if (/invalid_post_content/.test(message)) return "본문을 공백 제외 5~50자로 입력해 주세요.";
  if (/network|failed to fetch/i.test(message)) return "연결 상태를 확인한 후 다시 시도해 주세요.";
  return "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}
