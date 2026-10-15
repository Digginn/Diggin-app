import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import type { AuthProvider } from "@/components/AuthProviderIcon";
import { supabase } from "@/lib/supabase";

export type MyProfile = {
  nickname: string;
  avatarUrl?: string;
  authProvider?: AuthProvider;
};

// AUTH-008 Validation 문구. 서버가 돌려준 첫 오류 코드에 맞춰 보여준다.
const NICKNAME_ERROR_MESSAGES: Record<string, string> = {
  length: "닉네임은 2~10자로 입력해 주세요.",
  whitespace: "닉네임에는 공백을 사용할 수 없습니다.",
  invalid_characters: "닉네임은 한글·영문·숫자만 사용할 수 있습니다.",
  profanity: "욕설·혐오 등 부적절한 표현은 사용할 수 없습니다.",
  impersonation: "공식 계정으로 오해할 수 있는 닉네임은 사용할 수 없습니다.",
  duplicate: "이미 사용 중인 닉네임입니다.",
};

const AVATAR_BUCKET = "avatars";
const AVATAR_SIZE = 512;
const AVATAR_URL_TTL_SECONDS = 60 * 60;

async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function fetchMyProfile(): Promise<MyProfile> {
  const user = await getUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("nickname, avatar_path")
    .eq("id", user.id)
    .single();
  if (error) throw error;

  // 비공개 버킷이라 공개 URL이 없다. 본인만 열 수 있는 서명 URL을 만든다.
  let avatarUrl: string | undefined;
  if (data.avatar_path) {
    const signed = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(data.avatar_path, AVATAR_URL_TTL_SECONDS);
    avatarUrl = signed.data?.signedUrl;
  }

  const provider = user.app_metadata.provider;
  const authProvider =
    provider === "kakao" || provider === "google" || provider === "apple" ? provider : undefined;

  return { nickname: data.nickname, avatarUrl, authProvider };
}

/** 검사에 걸리면 화면에 보여줄 문구를, 저장되면 undefined를 돌려준다. */
export async function saveNickname(nickname: string): Promise<string | undefined> {
  const { data, error } = await supabase.rpc("update_nickname", { new_nickname: nickname });
  if (error) throw error;
  if (!data) return undefined;
  return NICKNAME_ERROR_MESSAGES[data] ?? NICKNAME_ERROR_MESSAGES.invalid_characters;
}

// MY-003 원본은 올리지 않고 512×512 WebP로 줄여 사용자당 한 장만 둔다.
export async function saveAvatar(uri: string) {
  const user = await getUser();
  const image = await ImageManipulator.manipulate(uri)
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE })
    .renderAsync();
  const webp = await image.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });
  const body = await (await fetch(webp.uri)).arrayBuffer();

  const path = `${user.id}/avatar.webp`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, body, { contentType: "image/webp", upsert: true });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc("set_avatar", { new_path: path });
  if (error) throw error;
}
