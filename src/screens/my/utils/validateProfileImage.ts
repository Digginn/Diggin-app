import { PROFILE_MESSAGES } from "../constants/profileMessages";

const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const SUPPORTED_EXTENSION = /\.(jpe?g|png|webp|heic|heif)$/i;

type PickedImage = { uri: string; mimeType?: string | null; fileSize?: number | null };

/** MY-003 고른 사진이 쓸 수 없으면 보여줄 문구를, 쓸 수 있으면 undefined를 돌려준다. */
// shortcut: iOS에서 편집(자르기)을 켜면 크기·형식이 잘린 결과 기준이다. 원본 기준이 필요하면 편집 없이 받은 뒤 직접 자른다.
export function validateProfileImage({ uri, mimeType, fileSize }: PickedImage) {
  const isSupported = mimeType
    ? SUPPORTED_MIME_TYPES.includes(mimeType.toLowerCase())
    : SUPPORTED_EXTENSION.test(uri);
  if (!isSupported) return PROFILE_MESSAGES.photoInvalidFormat;
  if (fileSize != null && fileSize > MAX_ORIGINAL_BYTES) return PROFILE_MESSAGES.photoTooLarge;
  return undefined;
}
