import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

const AVATAR_BUCKET = "avatars";
const AVATAR_PAGE = 100;

/** 애플 가입자면 애플 계정 ID(sub), 아니면 null */
export async function appleSubject(client: SupabaseClient, userId: string) {
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error("user_lookup_failed");
  const identity = data.user.identities?.find((item) => item.provider === "apple");
  if (!identity) return null;
  const subject = identity.identity_data?.sub;
  if (typeof subject !== "string" || !subject) throw new Error("apple_subject_missing");
  return subject;
}

export async function removeAvatars(client: SupabaseClient, userId: string) {
  const bucket = client.storage.from(AVATAR_BUCKET);
  while (true) {
    const { data, error } = await bucket.list(userId, { limit: AVATAR_PAGE });
    if (error) throw new Error("avatar_list_failed");
    if (!data.length) return;
    const { error: removeError } = await bucket.remove(
      data.map((file) => `${userId}/${file.name}`),
    );
    if (removeError) throw new Error("avatar_remove_failed");
    if (data.length < AVATAR_PAGE) return;
  }
}

// auth.users를 지우면 세션·리프레시 토큰과 FK로 묶인 데이터가 함께 지워진다(DB_SCHEMA 8).
export async function deleteUser(client: SupabaseClient, userId: string) {
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw new Error("delete_user_failed");
}
