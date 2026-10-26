import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { supabase } from "@/lib/supabase";

export const AVATAR_BUCKET = "avatars";
const AVATAR_SIZE = 512;
/** 파일 손상·읽기·HEIC 변환 실패(MSG-MY-013). 업로드 실패(MSG-MY-005)와 구분한다. */
export const AVATAR_UNREADABLE_ERROR = "avatar_unreadable";

// MY-003 원본은 올리지 않고 512×512 WebP로 줄여 사용자당 한 장만 둔다.
export async function saveAvatar(uri: string) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  let body: ArrayBuffer;
  try {
    // 카카오 프로필처럼 원격 이미지는 먼저 불러온다. 변환 모듈은 로컬 파일만 읽는다.
    const source = /^https?:\/\//.test(uri) ? await Image.loadAsync(uri) : uri;
    const context = ImageManipulator.manipulate(source);
    const original = await context.renderAsync();
    const side = Math.min(original.width, original.height);
    // 직사각형을 바로 512×512로 줄이면 찌그러지므로 중앙을 정사각형으로 자른 뒤 축소한다.
    const image = await context
      .crop({
        originX: Math.floor((original.width - side) / 2),
        originY: Math.floor((original.height - side) / 2),
        width: side,
        height: side,
      })
      .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE })
      .renderAsync();
    const webp = await image.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });
    body = await (await fetch(webp.uri)).arrayBuffer();
  } catch {
    throw new Error(AVATAR_UNREADABLE_ERROR);
  }

  const path = `${auth.user.id}/avatar.webp`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, body, { contentType: "image/webp", upsert: true });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc("set_avatar", { new_path: path });
  if (error) throw error;
}
