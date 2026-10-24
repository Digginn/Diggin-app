import { cssInterop } from "nativewind";
import { useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import TooltipSvg from "@/assets/images/icon-tooltip.svg";
import { TextField } from "@/components/Field";
import { Tooltip } from "@/components/Tooltip";
import { WishLevelSelect } from "@/components/WishLevelSelect";
import { useNativeModalVisible } from "@/hooks/useNativeModalVisible";
import type { ItemSaveValues } from "@/types/wish-item";
import { formatPriceInput } from "@/utils/formatPriceInput";

const TooltipIcon = cssInterop(TooltipSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

const HINT = "얼마나 사고 싶은지를\n3단계로 기록해두어\nALL 탭에서 빠르게\n분류할 수 있습니다.";

const HINT_GAP = 10;
const HINT_TOP_OFFSET = 4;

export type ItemInfoOverlay = "level" | "hint" | null;

function FieldLabel({ label, isMissing }: { label: string; isMissing: boolean }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="text-gray-900 font-b3">{label}</Text>
      {isMissing && <Text className="text-semantic-error font-note">*필수 정보</Text>}
    </View>
  );
}

type Anchor = { x: number; y: number; width: number; height: number };

type ItemInfoFieldsProps = {
  values: ItemSaveValues;
  onChange: (values: ItemSaveValues) => void;
  /**
   * 위시 레벨 메뉴·툴팁 중 열린 것. 툴팁은 별도 모달이라 화면을 닫기 전에 부모가 먼저 닫아야
   * 남은 모달이 화면을 막지 않는다. 그래서 상태를 부모가 들고 있다.
   */
  overlay: ItemInfoOverlay;
  onOverlayChange: (overlay: ItemInfoOverlay) => void;
};

/** 아이템명·브랜드명·가격·위시 레벨 입력. 아이템 상세 수정 시트와 저장 페이지가 같이 쓴다. */
export function ItemInfoFields({
  values,
  onChange,
  overlay,
  onOverlayChange,
}: ItemInfoFieldsProps) {
  const hintRef = useRef<View>(null);
  const [hintAnchor, setHintAnchor] = useState<Anchor>({ x: 0, y: 0, width: 0, height: 0 });
  const isHintVisible = useNativeModalVisible(overlay === "hint");
  const isNameMissing = !values.name.trim();

  const update =
    <K extends keyof ItemSaveValues>(key: K) =>
    (value: ItemSaveValues[K]) =>
      onChange({ ...values, [key]: value });

  function toggleHint() {
    if (overlay === "hint") {
      onOverlayChange(null);
      return;
    }
    hintRef.current?.measureInWindow((x, y, width, height) => {
      setHintAnchor({ x, y, width, height });
      onOverlayChange("hint");
    });
  }

  return (
    <>
      <View className="gap-4">
        <View className="gap-2">
          <FieldLabel label="아이템명" isMissing={isNameMissing} />
          <TextField
            growsTo={88}
            maxLength={100}
            isError={isNameMissing}
            placeholder="아이템명을 입력해 주세요."
            value={values.name}
            onChangeText={(text) =>
              update("name")(Array.from(splitGraphemes(text)).slice(0, 100).join(""))
            }
          />
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1 gap-2">
            <Text className="text-gray-900 font-b3">브랜드명</Text>
            <TextField
              maxLength={30}
              placeholder="선택 입력"
              value={values.brand}
              onChangeText={(text) =>
                update("brand")(Array.from(splitGraphemes(text)).slice(0, 30).join(""))
              }
            />
          </View>
          <View className="flex-1 gap-2">
            <Text className="text-gray-900 font-b3">가격</Text>
            {/* SAVE-005 가격은 선택값이다. 비워 두면 null로 저장해 "가격 정보 없음"으로 보인다. */}
            <TextField
              keyboardType="number-pad"
              placeholder="가격 입력"
              value={formatPriceInput(values.price)}
              onChangeText={(text) => update("price")(text.replace(/\D/g, ""))}
            />
          </View>
        </View>
      </View>

      <View className="h-8 flex-row items-center justify-between">
        <View className="h-8 flex-row items-center">
          <Text className="text-gray-900 font-b3">위시 레벨</Text>
          <View ref={hintRef} className="h-8 w-12 items-center justify-center">
            <Pressable
              accessibilityLabel="위시 레벨 설명"
              accessibilityRole="button"
              accessibilityState={{ expanded: overlay === "hint" }}
              className="size-12 items-center justify-center active:opacity-75"
              onPress={toggleHint}
            >
              <TooltipIcon className="size-6" />
            </Pressable>
          </View>
        </View>
        <WishLevelSelect
          level={values.wishLevel}
          isOpen={overlay === "level"}
          onToggle={() => onOverlayChange(overlay === "level" ? null : "level")}
          onSelect={(level) => {
            update("wishLevel")(level);
            onOverlayChange(null);
          }}
        />
      </View>

      <Modal
        visible={isHintVisible}
        transparent
        animationType="none"
        onRequestClose={() => onOverlayChange(null)}
      >
        <Pressable className="absolute inset-0" onPress={() => onOverlayChange(null)} />
        <View
          className="absolute"
          style={{
            left: hintAnchor.x + hintAnchor.width + HINT_GAP,
            top: hintAnchor.y + HINT_TOP_OFFSET,
          }}
        >
          <Tooltip arrowPosition="left" message={HINT} onClose={() => onOverlayChange(null)} />
        </View>
      </Modal>
    </>
  );
}
