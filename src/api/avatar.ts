import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { supabase } from "@/lib/supabase";

export const AVATAR_BUCKET = "avatars";
const AVATAR_SIZE = 512;

// MY-003 원본은 올리지 않고 512×512 WebP로 줄여 사용자당 한 장만 둔다.
export async function saveAvatar(uri: string) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  // 카카오 프로필처럼 원격 이미지는 먼저 불러온다. 변환 모듈은 로컬 파일만 읽는다.
  const source = /^https?:\/\//.test(uri) ? await Image.loadAsync(uri) : uri;
  const image = await ImageManipulator.manipulate(source)
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE })
    .renderAsync();
  const webp = await image.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });
  const body = await (await fetch(webp.uri)).arrayBuffer();

  const path = `${auth.user.id}/avatar.webp`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, body, { contentType: "image/webp", upsert: true });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc("set_avatar", { new_path: path });
  if (error) throw error;
}
