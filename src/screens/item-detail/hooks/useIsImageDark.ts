import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { strToU8 } from "fflate";

import { coverCropRect, isDarkColor, readSinglePixelPng } from "../utils/imageBrightness";

type Rect = { x: number; y: number; width: number; height: number };

async function isAreaDark(url: string, frame: Omit<Rect, "x" | "y">, area: Rect) {
  const image = await Image.loadAsync(url);
  const pixel = await ImageManipulator.manipulate(image)
    .crop(coverCropRect(image, frame, area))
    .resize({ width: 1, height: 1 })
    .renderAsync();
  const { base64 } = await pixel.saveAsync({ base64: true, format: SaveFormat.PNG });
  const color = base64 ? readSinglePixelPng(strToU8(atob(base64), true)) : null;
  return color !== null && isDarkColor(color);
}

/** 이미지에서 area 뒤가 어두운지. 계산 전이나 실패하면 false(기본 색)다. */
export function useIsImageDark(url: string | undefined, frame: Omit<Rect, "x" | "y">, area: Rect) {
  const { data } = useQuery({
    queryKey: [
      "image-dark",
      url,
      frame.width,
      frame.height,
      area.x,
      area.y,
      area.width,
      area.height,
    ],
    queryFn: () => isAreaDark(url ?? "", frame, area),
    enabled: url !== undefined,
    staleTime: Infinity,
    retry: false,
  });
  return data === true;
}
