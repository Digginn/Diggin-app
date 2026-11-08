import { Image as ExpoImage } from "expo-image";
import { cssInterop } from "nativewind";
import { Animated, View } from "react-native";

import {
  IconCsvHeart18,
  IconCsvHeart22,
  IconCsvHeart27,
  ImageCsvBag,
  ImageCsvBasket,
  ImageCsvBeam,
  ImageCsvGlow,
  ImageCsvFolderBack,
  ImageCsvFolderFront,
  ImageCsvJacket,
  ImageCsvShirt,
  ImageCsvSlippers,
} from "@/assets/images/my/csv";
import { baseFrame } from "@/theme";

import { useCsvIllustrationMotion } from "../hooks/useCsvIllustrationMotion";

const Image = cssInterop(ExpoImage, { className: "style" });

type CsvImportIllustrationProps = { width: number; height: number; hasResult?: boolean };

export function CsvImportIllustration({
  width,
  height,
  hasResult = false,
}: CsvImportIllustrationProps) {
  const scale = Math.min(width / baseFrame.width, height / baseFrame.height);
  const motion = useCsvIllustrationMotion(!hasResult);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute"
      style={{
        width: baseFrame.width,
        height: baseFrame.height,
        left: (width - baseFrame.width) / 2,
        top: (height - baseFrame.height) / 2,
        transform: [{ scale }],
      }}
    >
      {!hasResult && (
        <>
          <Animated.View
            className="absolute left-[28px] top-[140px] h-[544px] w-[320px]"
            style={motion.beamStyle}
          >
            <Image source={ImageCsvBeam} contentFit="fill" className="h-full w-full" />
          </Animated.View>
          {/* Figma의 빛 PNG는 검은 배경을 포함하므로 screen 합성으로 배경을 제거합니다. */}
          <Animated.View
            className="absolute left-[97.5px] top-[539.825px] h-[76.35px] w-[181px]"
            style={{ ...motion.glowStyle, mixBlendMode: "screen" }}
          >
            <Image source={ImageCsvGlow} contentFit="fill" className="h-full w-full" />
          </Animated.View>
        </>
      )}
      <View className="absolute left-[101px] top-[558px] h-[116px] w-[174px]">
        <Animated.View className="absolute inset-0" style={motion.folderStyle}>
          <Image
            source={ImageCsvFolderBack}
            contentFit="fill"
            className="absolute left-[11.6px] h-[116px] w-[150.8px] overflow-hidden rounded-[8.7px]"
          />
        </Animated.View>
        <Animated.View
          className="absolute left-[88.62px] top-[-12.38px] h-[85.585px] w-[85.585px] items-center justify-center rounded-xl bg-gray-100 shadow-lg"
          style={motion.productStyle(0)}
        >
          <Image
            source={ImageCsvJacket}
            contentFit="contain"
            className={hasResult ? "h-[64.199px] w-[50.897px]" : "h-[63.691px] w-[63.691px]"}
          />
          <View className="absolute left-[69.66px] top-[72.44px] shadow-lg">
            <IconCsvHeart22 />
          </View>
        </Animated.View>
        <Animated.View
          className="absolute left-[18.566px] top-[-77.433px] h-16 w-16 items-center justify-center rounded-xl bg-gray-100 shadow-lg"
          style={motion.productStyle(1)}
        >
          <Image
            source={ImageCsvSlippers}
            contentFit="contain"
            className="h-[45.333px] w-[52.267px]"
          />
          <View
            className="absolute left-[49.33px] top-[50.22px] shadow-lg"
            style={{ transform: [{ rotate: "-1.48deg" }] }}
          >
            <IconCsvHeart22 />
          </View>
        </Animated.View>
        <Animated.View
          className="absolute left-[-21.791px] top-[-197.791px] h-[84px] w-[84px] items-center justify-center rounded-xl bg-gray-100 shadow-lg"
          style={motion.productStyle(2)}
        >
          <Image
            source={ImageCsvShirt}
            contentFit="contain"
            className="h-[71.337px] w-[62.279px]"
          />
          <View className="absolute left-[67.41px] top-[66.82px] shadow-lg">
            <IconCsvHeart27 />
          </View>
        </Animated.View>
        <Animated.View
          className="absolute left-[137.473px] top-[-179.527px] h-[58.143px] w-[57.6px] items-center justify-center rounded-xl bg-gray-100 shadow-lg"
          style={motion.productStyle(3)}
        >
          <Image source={ImageCsvBag} contentFit="contain" className="h-[40.32px] w-[45.589px]" />
          <View className="absolute left-[46.82px] top-[47.73px] shadow-lg">
            <IconCsvHeart18 />
          </View>
        </Animated.View>
        <Animated.View
          className="absolute left-[89px] top-[-148px] h-[66px] w-[66px] items-center justify-center rounded-xl bg-gray-100 shadow-lg"
          style={motion.productStyle(4)}
        >
          <Image
            source={ImageCsvBasket}
            contentFit="contain"
            className="h-[50.627px] w-[44.841px]"
          />
          <View className="absolute left-[55.51px] top-[56.51px] shadow-lg">
            <IconCsvHeart18 />
          </View>
        </Animated.View>
        <Animated.View className="absolute inset-0" style={motion.folderStyle}>
          <View className="absolute left-0 top-[28.638px]">
            <ImageCsvFolderFront />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
