import { useEffect, useState, type RefObject } from "react";
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Mask, Rect } from "react-native-svg";

import CloseIcon from "@/assets/images/first-visit/icon-close-white.svg";
import LinkIcon from "@/assets/images/first-visit/icon-link.svg";
import ShareIcon from "@/assets/images/first-visit/icon-share.svg";
import PointerDot from "@/assets/images/first-visit/image-pointer-dot.svg";
import type { FirstVisitGuideKind } from "@/hooks/useFirstVisitGuide";
import { colors } from "@/theme";

type Target = "owned" | "fab" | "wish" | "vote";
type Bounds = { x: number; y: number; width: number; height: number };
type GuideTargets = Partial<Record<Target, RefObject<View | null>>>;

function CoachPointer({
  left,
  top,
  length,
  direction = "down",
}: {
  left: number;
  top: number;
  length: number;
  direction?: "down" | "left" | "right";
}) {
  const isHorizontal = direction !== "down";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left,
        top,
        width: isHorizontal ? length : 12,
        height: isHorizontal ? 12 : length,
      }}
    >
      <View
        style={{
          width: 12,
          height: length,
          left: isHorizontal ? (length - 12) / 2 : 0,
          top: isHorizontal ? (12 - length) / 2 : 0,
          transform: [
            { rotate: direction === "left" ? "90deg" : direction === "right" ? "-90deg" : "0deg" },
          ],
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 5.25,
            top: 0,
            width: 1.5,
            height: length - 6,
            experimental_backgroundImage:
              "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))",
          }}
        />
        <View style={{ position: "absolute", left: -11, top: length - 21 }}>
          <PointerDot />
        </View>
      </View>
    </View>
  );
}

function CoachMark({
  title,
  description,
  isCentered = false,
  isRightAligned = false,
}: {
  title: string;
  description: string;
  isCentered?: boolean;
  isRightAligned?: boolean;
}) {
  return (
    <View
      className={
        isCentered ? "items-center gap-1" : isRightAligned ? "items-end gap-1" : "items-start gap-1"
      }
    >
      <Text className="text-gray-0 font-label-16-bold">{title}</Text>
      <Text
        className={`text-gray-300 font-b4 ${isCentered ? "text-center" : isRightAligned ? "text-right" : ""}`}
      >
        {description}
      </Text>
    </View>
  );
}

export function FirstVisitGuide({
  kind,
  targets,
  onClose,
}: {
  kind: FirstVisitGuideKind;
  targets?: GuideTargets;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState({ width, height: height + insets.top + insets.bottom });
  const [bounds, setBounds] = useState<Partial<Record<Target, Bounds>>>({});

  useEffect(() => {
    let isActive = true;
    // 첫 레이아웃/폴더 스크롤이 끝난 위치를 사용합니다. 고정 좌표로 강조하지 않습니다.
    const timer = setTimeout(() => {
      for (const [target, ref] of Object.entries(targets ?? {})) {
        ref.current?.measureInWindow((x, y, targetWidth, targetHeight) => {
          if (isActive && targetWidth > 0 && targetHeight > 0) {
            setBounds((previous) => ({
              ...previous,
              [target]: {
                x,
                y: y + (Platform.OS === "android" ? insets.top : 0),
                width: targetWidth,
                height: targetHeight,
              },
            }));
          }
        });
      }
    }, 150);
    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [targets, width, height, insets.top]);

  const owned = bounds.owned;
  const fab = bounds.fab;
  const wish = bounds.wish;
  const vote = bounds.vote;
  const holes = Object.entries(bounds).map(([target, rect]) => {
    if (target === "vote") return { ...rect, radius: 0 };
    if (target === "wish") {
      return {
        ...rect,
        x: rect.x - 4,
        y: rect.y + 6,
        width: rect.width + 8,
        height: 36,
        radius: 18,
      };
    }
    return {
      ...rect,
      x: rect.x - 4,
      y: rect.y - 4,
      width: rect.width + 8,
      height: rect.height + (target === "owned" ? 22 : 8),
      radius: target === "fab" ? 31 : 16,
    };
  });

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <View
        className="flex-1"
        accessibilityViewIsModal
        onLayout={(event) =>
          setViewport({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        <Svg width={viewport.width} height={viewport.height} style={{ position: "absolute" }}>
          <Defs>
            <Mask
              id="first-visit-spotlight"
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={viewport.width}
              height={viewport.height}
            >
              <Rect width={viewport.width} height={viewport.height} fill="white" />
              {holes.map((rect, index) => (
                <Rect key={index} {...rect} rx={rect.radius} fill="black" />
              ))}
            </Mask>
          </Defs>
          <Rect
            width={viewport.width}
            height={viewport.height}
            fill={colors.gray[1000]}
            opacity={0.72}
            mask="url(#first-visit-spotlight)"
          />
        </Svg>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="첫 진입 안내 닫기"
          onPress={onClose}
          className="absolute right-3 size-12 items-center justify-center active:opacity-75"
          style={{ top: insets.top + (kind === "all" ? 46 : 4) }}
        >
          <CloseIcon />
        </Pressable>

        {kind === "all" && (
          <View className="absolute inset-x-margin" style={{ top: insets.top + 103 }}>
            <Text className="text-gray-0 font-h2">위시 아이템을 추가하는 방법</Text>
            <Text className="mt-2.5 text-gray-0 font-b1">
              {"아래 두 가지 방법으로\n텅 빈 공간을 가득 채워보세요."}
            </Text>
            <View className="mt-[58px] gap-[30px]">
              <View className="gap-10">
                <View className="flex-row items-start gap-3">
                  <View className="size-10 items-center justify-center rounded-full bg-gray-0">
                    <View className="-rotate-45">
                      <LinkIcon />
                    </View>
                  </View>
                  <View className="flex-1">
                    <CoachMark
                      title="링크 복사"
                      description={
                        "타 쇼핑 앱에서 아이템의 링크를 복사한\n후 Diggin을 열면 자동으로 불러옵니다."
                      }
                    />
                  </View>
                </View>
                <View className="flex-row items-start gap-3">
                  <View className="size-10 items-center justify-center rounded-full bg-gray-0">
                    <ShareIcon />
                  </View>
                  <View className="flex-1">
                    <CoachMark
                      title="공유하기"
                      description={
                        "타 쇼핑 앱의 아이템 공유하기를 누르고\n공유 목록에서 Diggin을 선택하세요."
                      }
                    />
                  </View>
                </View>
              </View>
              <View className="h-px bg-gray-0/20" />
              <View className="flex-row items-start gap-[14px] rounded-xl bg-gray-900 px-4 py-[14px]">
                <Text className="text-gray-0 font-label-16-bold">Tip</Text>
                <Text className="flex-1 text-gray-300 font-b4">
                  {
                    "갤러리의 '모든 사진'과 '앨범'과 같습니다.\nALL 탭은 아이템의 개별 나열,\nFOLDER 탭은 아이템들의 묶음입니다."
                  }
                </Text>
              </View>
            </View>
          </View>
        )}

        {kind === "folder" && owned && (
          <>
            <View
              className="absolute"
              style={{
                left: owned.x + owned.width + 46,
                top: owned.y + owned.height / 2 - 3,
              }}
            >
              <CoachMark
                isCentered
                title="나의 소장템"
                description={"구매한 아이템을\n저장할 수 있습니다."}
              />
            </View>
            <CoachPointer
              length={37}
              direction="left"
              left={owned.x + owned.width + 14}
              top={owned.y + owned.height / 2 + 1}
            />
          </>
        )}
        {kind === "folder" && fab && (
          <>
            <View
              className="absolute"
              style={{ left: fab.x + fab.width / 2 - 124, top: fab.y - 124, width: 124 }}
            >
              <CoachMark
                title="새 폴더 만들기"
                isRightAligned
                description={"해당 버튼을 눌러\n새로운 폴더를 만듭니다."}
              />
            </View>
            <CoachPointer length={37} left={fab.x + fab.width / 2 - 6} top={fab.y - 60} />
          </>
        )}
        {kind === "item-detail" && wish && (
          <>
            <View
              className="absolute right-4"
              style={{ left: wish.x + wish.width + 62, top: wish.y + 4 }}
            >
              <CoachMark
                title="위시레벨"
                description={"구매 우선순위를 높음·중간·낮음으로\n나눠 기록할 수 있습니다."}
              />
            </View>
            <CoachPointer
              length={38}
              direction="left"
              left={wish.x + wish.width + 16}
              top={wish.y + 18}
            />
          </>
        )}
        {kind === "item-detail" && vote && (
          <>
            <View className="absolute inset-x-margin" style={{ top: vote.y - 104 }}>
              <CoachMark
                isCentered
                title="BUY / NOT 투표"
                description="구매가 고민될 땐 다른 사용자에게 의견을 구할 수 있습니다."
              />
            </View>
            <CoachPointer length={41} left={width / 2 - 6} top={vote.y - 53} />
          </>
        )}
      </View>
    </Modal>
  );
}
