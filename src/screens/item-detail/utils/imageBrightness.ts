import { unzlibSync } from "fflate";

type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };

/** contentFit="cover"로 frame에 그린 이미지에서 area 뒤에 깔리는 원본 영역. */
export function coverCropRect(image: Size, frame: Size, area: Rect) {
  const scale = Math.max(frame.width / image.width, frame.height / image.height);
  const offsetX = (frame.width - image.width * scale) / 2;
  const offsetY = (frame.height - image.height * scale) / 2;
  const originX = Math.max(0, Math.floor((area.x - offsetX) / scale));
  const originY = Math.max(0, Math.floor((area.y - offsetY) / scale));
  return {
    originX,
    originY,
    width: Math.max(1, Math.min(image.width - originX, Math.ceil(area.width / scale))),
    height: Math.max(1, Math.min(image.height - originY, Math.ceil(area.height / scale))),
  };
}

/** 1×1 PNG의 RGB. 8비트 RGB·RGBA가 아니면 null. */
export function readSinglePixelPng(bytes: Uint8Array): [number, number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idat: Uint8Array[] = [];
  let colorType = -1;
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      if (data[8] !== 8) return null;
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (colorType !== 2 && colorType !== 6) return null;
  const joined = new Uint8Array(idat.reduce((sum, chunk) => sum + chunk.length, 0));
  idat.reduce((offset, chunk) => (joined.set(chunk, offset), offset + chunk.length), 0);
  const raw = unzlibSync(joined);
  // 픽셀이 하나라 왼쪽·위 이웃이 모두 0이어서 줄 앞 필터 종류와 관계없이 값이 그대로다.
  if (colorType === 2) return [raw[1], raw[2], raw[3]];
  // 투명 PNG(KREAM 등)는 투명한 곳이 0,0,0으로 읽혀 검게 보인다. 화면에서처럼 흰 배경 위에 섞은 색으로 본다.
  const alpha = raw[4] / 255;
  const onWhite = (value: number) => Math.round(value * alpha + 255 * (1 - alpha));
  return [onWhite(raw[1]), onWhite(raw[2]), onWhite(raw[3])];
}

/** WCAG 상대 휘도 기준으로 흰색이 검정보다 잘 보이면 어두운 색이다. */
export function isDarkColor([r, g, b]: [number, number, number]) {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) < 0.179;
}
