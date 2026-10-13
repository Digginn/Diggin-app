import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { cssInterop } from "nativewind";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import CoupangIcon from "@/assets/images/icon-onboarding-coupang.svg";
import CsvAppIcon from "@/assets/images/icon-onboarding-csv-app.svg";
import HouseIcon from "@/assets/images/icon-onboarding-house.svg";
import InstagramIcon from "@/assets/images/icon-onboarding-instagram.svg";
import KakaoIcon from "@/assets/images/icon-onboarding-kakao.svg";
import KurlyIcon from "@/assets/images/icon-onboarding-kurly.svg";
import NaverIcon from "@/assets/images/icon-onboarding-naver.svg";
import PhotoIcon from "@/assets/images/icon-onboarding-photo.svg";
import { IconMySupport, IconMyChevron } from "@/assets/images/my";
import CsvGlow from "@/assets/images/onboarding-csv-glow.svg";
import CsvTap from "@/assets/images/onboarding-csv-tap.svg";
import FolderFront from "@/assets/images/onboarding-folder-front.svg";

// Figma의 세 일러스트는 같은 3.6초 타임라인을 반복한다.
const DURATION_MS = 3600;
const EASE_OUT = Easing.bezierFn(0, 0, 0.58, 1);
const EASE_IN_OUT = Easing.bezierFn(0.42, 0, 0.58, 1);
const Gradient = cssInterop(LinearGradient, { className: "style" });
const Image = cssInterop(ExpoImage, { className: "style" });
// NativeWind 스타일을 먼저 처리하는 기본 뷰를 애니메이션 대상으로 사용한다.
const AnimatedView = Animated.createAnimatedComponent(cssInterop(View, { className: "style" }));
const AnimatedText = Animated.createAnimatedComponent(cssInterop(Text, { className: "style" }));
const APP_ICONS = [
  KakaoIcon,
  CoupangIcon,
  HouseIcon,
  "pink",
  "photo",
  InstagramIcon,
  NaverIcon,
  "black",
  KurlyIcon,
  HouseIcon,
  "pink",
  "photo",
  InstagramIcon,
  NaverIcon,
  "black",
] as const;
const ITEMS = [
  {
    source: require("@/assets/images/onboarding-item-one.png"),
    left: -30.8,
    top: -79.63,
    width: 100.29,
    height: 120.317,
    rotate: "-12deg",
    delay: 200,
  },
  {
    source: require("@/assets/images/onboarding-item-two.png"),
    left: 22.81,
    top: -95,
    width: 87.199,
    height: 111.322,
    rotate: "4deg",
    delay: 450,
  },
  {
    source: require("@/assets/images/onboarding-item-three.png"),
    left: 63.56,
    top: -57,
    width: 103.267,
    height: 122.205,
    rotate: "14deg",
    delay: 700,
  },
] as const;

function progress(time: number, start: number, duration: number) {
  "worklet";
  return EASE_OUT(Math.max(0, Math.min(1, (time - start) / duration)));
}

function AppCell({ index, time }: { index: number; time: SharedValue<number> }) {
  const Icon = APP_ICONS[index];
  const delay = 100 + index * 80;
  const iconStyle = useAnimatedStyle(() => ({
    opacity: progress(time.value, delay, 250),
    transform: [{ scale: 0.4 + 0.6 * progress(time.value, delay, 400) }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: progress(time.value, delay + 100, 250) }));
  return (
    <View className="w-10 items-center gap-1.5">
      <AnimatedView className="size-10" style={iconStyle}>
        {typeof Icon === "string" ? (
          <View
            className={`size-10 items-center justify-center rounded-[10px] shadow-sm ${Icon === "pink" ? "bg-[#F868E0]" : Icon === "black" ? "bg-gray-900" : "border-[0.625px] border-gray-200 bg-gray-0"}`}
          >
            {Icon === "photo" ? (
              <PhotoIcon />
            ) : (
              <View className="size-[15px] rounded-[3.75px] bg-gray-0" />
            )}
          </View>
        ) : (
          <View className="absolute left-[-7.5px] top-[-5px]">
            <Icon />
          </View>
        )}
      </AnimatedView>
      <AnimatedView className="h-1 w-6 rounded-sm bg-gray-300" style={labelStyle} />
    </View>
  );
}

function PhoneIllustration({ time }: { time: SharedValue<number> }) {
  return (
    <View className="absolute left-[58px] top-11 h-[400px] w-[180px] overflow-hidden rounded-[32px] bg-gray-900">
      <View className="absolute left-[5px] top-[5px] h-[390px] w-[170px] overflow-hidden rounded-[27px] bg-gray-50">
        <View className="absolute left-[59px] top-[9px] h-[14px] w-[52px] rounded-[7px] bg-gray-900" />
        <View className="absolute left-[11px] top-10 w-[148px] flex-row flex-wrap gap-[14px]">
          {APP_ICONS.map((_, index) => (
            <AppCell key={index} index={index} time={time} />
          ))}
        </View>
      </View>
    </View>
  );
}

function ItemTile({ item, time }: { item: (typeof ITEMS)[number]; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress(time.value, item.delay, 250),
    transform: [{ translateY: -150 * (1 - progress(time.value, item.delay, 600)) }],
  }));
  return (
    <AnimatedView
      className="absolute items-center justify-center"
      style={[{ left: item.left, top: item.top, width: item.width, height: item.height }, style]}
    >
      <View
        className="gap-1.5 rounded-xl bg-gray-0 px-2 pb-2.5 pt-2"
        style={{ transform: [{ rotate: item.rotate }], boxShadow: "0px 4px 12px rgba(0,0,0,0.08)" }}
      >
        <Image
          source={item.source}
          contentFit="contain"
          className="size-16 rounded-lg bg-gray-50"
        />
        <View className="h-1.5 w-12 rounded-[3px] bg-gray-300" />
        <View className="h-1.5 w-8 rounded-[3px] bg-gray-200" />
      </View>
    </AnimatedView>
  );
}

function FolderIllustration({ time }: { time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const pulse =
      time.value <= 1400
        ? progress(time.value, 1250, 150)
        : 1 - EASE_IN_OUT(Math.max(0, Math.min(1, (time.value - 1400) / 250)));
    return { transform: [{ scaleX: 1 + 0.04 * pulse }, { scaleY: 1 - 0.03 * pulse }] };
  });
  return (
    <AnimatedView
      className="absolute left-[55px] top-[133.8px] w-[186px] gap-[9.6px] pt-[26.4px]"
      style={style}
    >
      <View className="h-[124.8px] w-full">
        <View className="absolute left-[25.8px] top-[22.8px] h-[102px] w-[134.4px]">
          <Gradient
            colors={["#E5E5E5", "rgba(255,255,255,0.68)"]}
            locations={[0.24118, 1]}
            className="absolute inset-0 rounded-[7.669px] border-[0.6px] border-gray-0"
          />
          {ITEMS.map((item, index) => (
            <ItemTile key={index} item={item} time={time} />
          ))}
          <View className="absolute left-[-0.3px] top-[5.7px]">
            <FolderFront />
          </View>
        </View>
      </View>
      <View className="gap-[2.4px] pl-6">
        <Text
          className="font-pretendard-bold text-gray-900"
          style={{
            fontSize: 16.8,
            lineHeight: 25.2,
            letterSpacing: -0.168,
            includeFontPadding: false,
          }}
        >
          나의 위시
        </Text>
        <Text
          className="font-pretendard-medium text-gray-500"
          style={{ fontSize: 12, lineHeight: 14.4, includeFontPadding: false }}
        >
          12개의 아이템
        </Text>
      </View>
    </AnimatedView>
  );
}

function VoteResult({ isBuy, time }: { isBuy: boolean; time: SharedValue<number> }) {
  const rowStyle = useAnimatedStyle(() => ({
    opacity: progress(time.value, 650, 350),
    transform: [{ translateX: -24 * (1 - progress(time.value, 650, 350)) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: 1 + ((isBuy ? 216 : 96) - 1) * progress(time.value, 1050, isBuy ? 600 : 450),
  }));
  const countStyle = useAnimatedStyle(() => ({ opacity: progress(time.value, 1650, 250) }));
  return (
    <AnimatedView
      className="h-12 w-[216px] overflow-hidden rounded-lg bg-gray-100"
      style={rowStyle}
    >
      <AnimatedView
        className={`absolute inset-y-0 left-0 ${isBuy ? "bg-gray-900" : "bg-gray-300"}`}
        style={fillStyle}
      >
        {isBuy && (
          <AnimatedText
            className="absolute right-4 top-[11px] text-gray-0 font-label-16-semibold"
            style={countStyle}
          >
            12명
          </AnimatedText>
        )}
      </AnimatedView>
      <View className="absolute inset-y-0 left-4 flex-row items-center gap-1.5">
        <Text className={`${isBuy ? "text-gray-0" : "text-gray-900"} font-label-16-bold`}>
          {isBuy ? "BUY" : "NOT"}
        </Text>
        {isBuy && (
          <AnimatedText className="text-gray-0 font-label-12-semibold" style={countStyle}>
            ✓ 내 선택
          </AnimatedText>
        )}
      </View>
      {!isBuy && (
        <AnimatedText
          className="absolute right-4 top-[11px] text-gray-900 font-label-16-semibold"
          style={countStyle}
        >
          5명
        </AnimatedText>
      )}
    </AnimatedView>
  );
}

function VoteIllustration({ time }: { time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress(time.value, 100, 400),
    transform: [{ translateY: 24 * (1 - progress(time.value, 100, 500)) }],
  }));
  return (
    <AnimatedView
      className="absolute left-6 top-[60px] items-center gap-2 overflow-hidden rounded-2xl bg-gray-0 p-4"
      style={[{ boxShadow: "0px 4px 16px rgba(0,0,0,0.06)" }, style]}
    >
      <Image
        source={require("@/assets/images/onboarding-vote-item.png")}
        contentFit="contain"
        className="size-[120px] rounded-lg bg-gray-50"
      />
      <View className="h-1 w-px" />
      <VoteResult isBuy time={time} />
      <VoteResult isBuy={false} time={time} />
    </AnimatedView>
  );
}

type CsvKeyframe = readonly [number, number, ((value: number) => number)?];
const CSV_EASE_IN = Easing.bezierFn(0.42, 0, 1, 1);
const CSV_COLLAPSE = Easing.bezierFn(0.55, 0, 0.85, 0.4);
const CSV_MENU_EASE = Easing.bezierFn(0.4, 0, 0.2, 1);
const CSV_ICON_MOVE = Easing.bezierFn(0.65, 0, 0.35, 1);
const CSV_ICON_EXIT = Easing.bezierFn(0.5, 0, 0.9, 0.6);
// Figma의 CSS linear()로 내보낸 스프링 곡선을 그대로 보간한다.
const CSV_SPRING = [
  0, 0.0242, 0.0871, 0.1757, 0.2793, 0.3892, 0.4987, 0.6028, 0.6982, 0.7827, 0.8552, 0.9156, 0.9641,
  1.0017, 1.0295, 1.0486, 1.0606, 1.0666, 1.068, 1.0659, 1.0613, 1.0551, 1.048, 1.0405, 1.0331,
  1.026, 1.0197, 1.014, 1.0092, 1.0052, 1.002, 0.9996, 0.9978, 0.9965, 0.9958, 0.9954, 0.9954,
  0.9955, 0.9959, 0.9963, 0.9968, 0.9973, 0.9978, 0.9983, 0.9987, 0.9991, 0.9994, 0.9997, 0.9999,
  1.0001, 1.0002,
];

function csvSpring(value: number) {
  "worklet";
  const position = value * (CSV_SPRING.length - 1);
  const index = Math.min(Math.floor(position), CSV_SPRING.length - 2);
  return CSV_SPRING[index] + (CSV_SPRING[index + 1] - CSV_SPRING[index]) * (position - index);
}

function csvTrack(time: number, frames: readonly CsvKeyframe[]) {
  "worklet";
  for (let index = 1; index < frames.length; index++) {
    const [end, to] = frames[index];
    const [start, from, ease = Easing.linear] = frames[index - 1];
    if (time <= end) {
      const value = Math.max(0, Math.min(1, (time - start) / (end - start)));
      return from + (to - from) * ease(value);
    }
  }
  return frames[frames.length - 1][1];
}

function CsvIllustration({ time }: { time: SharedValue<number> }) {
  const fileStyle = useAnimatedStyle(() => ({
    opacity: csvTrack(time.value, [
      [0, 0],
      [900, 0, EASE_OUT],
      [1300, 1],
      [2500, 1, CSV_EASE_IN],
      [2680, 0],
    ]),
    transform: [
      {
        translateY: csvTrack(time.value, [
          [0, -28],
          [900, -28, EASE_OUT],
          [1450, 0],
          [2100, 0, EASE_OUT],
          [2220, -8, CSV_COLLAPSE],
          [2680, 95],
        ]),
      },
      {
        rotate: `${csvTrack(time.value, [
          [0, 0],
          [2220, 0, CSV_EASE_IN],
          [2680, 0.14],
        ])}rad`,
      },
      {
        scale: csvTrack(time.value, [
          [0, 1],
          [2100, 1, EASE_OUT],
          [2220, 1.04, CSV_COLLAPSE],
          [2680, 0.12],
        ]),
      },
    ],
  }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: csvTrack(time.value, [
      [0, 1],
      [3000, 1, CSV_MENU_EASE],
      [3450, 0],
      [4150, 0, EASE_OUT],
      [4600, 1],
    ]),
    transform: [
      {
        translateY: csvTrack(time.value, [
          [0, 0],
          [3000, 0, CSV_MENU_EASE],
          [3450, -12],
          [4150, -20, EASE_OUT],
          [4600, 0],
        ]),
      },
    ],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: csvTrack(time.value, [
      [0, 0],
      [900, 0, EASE_OUT],
      [1300, 1],
      [3950, 1, CSV_ICON_EXIT],
      [4400, 0],
    ]),
    transform: [
      {
        translateY: csvTrack(time.value, [
          [0, -28],
          [900, -28, EASE_OUT],
          [1450, 0],
          [3000, 0, CSV_ICON_MOVE],
          [3550, -125],
          [3950, -125, CSV_ICON_EXIT],
          [4400, 70],
        ]),
      },
      {
        scale: csvTrack(time.value, [
          [0, 1],
          [2620, 1, EASE_OUT],
          [2760, 1.12, csvSpring],
          [3150, 1],
          [3950, 1, CSV_ICON_EXIT],
          [4400, 0.9],
        ]),
      },
    ],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: csvTrack(time.value, [
      [0, 0],
      [900, 0, EASE_OUT],
      [1450, 0.7],
      [2150, 0.7, CSV_EASE_IN],
      [2450, 0],
    ]),
  }));
  const tapStyle = useAnimatedStyle(() => ({
    opacity: csvTrack(time.value, [
      [0, 0],
      [550, 0, EASE_OUT],
      [650, 0.5, EASE_OUT],
      [1000, 0],
    ]),
    transform: [
      {
        scale: csvTrack(time.value, [
          [0, 0.5],
          [550, 0.5, EASE_OUT],
          [1000, 1.2],
        ]),
      },
    ],
  }));
  return (
    <>
      <AnimatedView className="absolute left-[165px] top-[210px]" style={glowStyle}>
        <CsvGlow />
      </AnimatedView>
      <AnimatedView
        className="absolute left-20 top-[143px] h-[171.478px] w-[136px] rounded-[17.739px] bg-gray-0"
        style={[{ boxShadow: "0px 5.913px 11.826px rgba(0,0,0,0.06)" }, fileStyle]}
      >
        <View className="absolute left-[14.783px] top-[14.783px] rounded-[13.304px] bg-gray-900 px-[13.304px] py-[4.435px]">
          <Text className="text-gray-0 font-nickname" style={{ includeFontPadding: false }}>
            CSV
          </Text>
        </View>
        {[0, 1, 2, 3].map((row) =>
          [0, 1].map((column) => (
            <View
              key={`${row}-${column}`}
              className={
                row === 0
                  ? "absolute rounded-[4.435px] bg-gray-300"
                  : "absolute rounded-[4.435px] bg-gray-200"
              }
              style={{
                left: column === 0 ? 14.783 : 70.957,
                top: 62.087 + row * 25.13,
                width: column === 0 ? 44.348 : 56.174,
                height: 14.783,
              }}
            />
          )),
        )}
      </AnimatedView>
      <AnimatedView
        className="absolute left-6 top-[27px] h-24 w-[248px] rounded-2xl bg-gray-0 p-3"
        style={menuStyle}
      >
        <View className="gap-2.5">
          <View className="flex-row items-start gap-2">
            <IconMySupport width={24} height={24} />
            <Text
              className="text-gray-900 font-label-16-semibold"
              style={{ includeFontPadding: false }}
            >
              고객지원
            </Text>
          </View>
          <View className="h-0.5 w-full bg-gray-900" />
        </View>
        <View className="h-12 flex-row items-center justify-between pl-2">
          <Text className="text-gray-800 font-b4" style={{ includeFontPadding: false }}>
            CSV 파일로 위시 아이템 불러오기
          </Text>
          <View className="-scale-x-100">
            <IconMyChevron width={18} height={18} />
          </View>
        </View>
        <AnimatedView className="absolute left-[202px] top-[54px]" style={tapStyle}>
          <CsvTap />
        </AnimatedView>
      </AnimatedView>
      <AnimatedView
        className="absolute left-[105px] top-[280px] size-[86px] overflow-hidden rounded-[21.5px]"
        style={[{ boxShadow: "0px 5.375px 8.063px rgba(0,0,0,0.12)" }, iconStyle]}
      >
        <CsvAppIcon />
      </AnimatedView>
    </>
  );
}

export function OnboardingIllustration({ page }: { page: number }) {
  const time = useSharedValue(0);
  const isReducedMotion = useReducedMotion();
  const duration = page === 3 ? 4750 : DURATION_MS;
  useEffect(() => {
    time.value = isReducedMotion ? (page === 3 ? 1700 : DURATION_MS) : 0;
    if (!isReducedMotion)
      time.value = withRepeat(withTiming(duration, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(time);
  }, [page, duration, isReducedMotion, time]);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-[396px] w-[295px] overflow-hidden rounded-3xl bg-gray-100"
    >
      {page === 0 ? (
        <PhoneIllustration time={time} />
      ) : page === 1 ? (
        <FolderIllustration time={time} />
      ) : page === 2 ? (
        <VoteIllustration time={time} />
      ) : (
        <CsvIllustration time={time} />
      )}
    </View>
  );
}
