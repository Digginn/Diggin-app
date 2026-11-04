import { useRef, useState } from "react";
import { Modal, Platform, Pressable, View, useWindowDimensions } from "react-native";

import KebabIcon from "@/assets/images/icon-kebab.svg";
import { FloatingToolbar } from "@/components/FloatingToolbar";
import { useNativeModalVisible } from "@/hooks/useNativeModalVisible";
import { colors } from "@/theme";

type Anchor = { x: number; y: number; width: number; height: number };
const MENU_WIDTH = 92;
const MENU_HEIGHT = 96;

/** iOS에서는 메뉴가 닫힌 뒤 신고·차단 창으로 넘긴다. */
export function ReportBlockMenu({
  onReport,
  onBlock,
  placement = "feed",
  isDisabled = false,
  onOpenChange,
}: {
  onReport: () => void;
  onBlock: () => void;
  placement?: "feed" | "header" | "comment";
  isDisabled?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [isOpen, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const isClosing = useRef(false);
  const isNativeVisible = useNativeModalVisible(isOpen);
  const { width, height } = useWindowDimensions();

  function finish() {
    const action = pending.current;
    pending.current = null;
    setAnchor(null);
    onOpenChange?.(false);
    action?.();
  }

  function close(action?: () => void) {
    if (isClosing.current) return;
    isClosing.current = true;
    pending.current = action ?? null;
    setOpen(false);
    if (Platform.OS !== "ios") finish();
  }

  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={placement === "comment" ? "댓글 메뉴" : "게시글 메뉴"}
        accessibilityState={{ expanded: isOpen, disabled: isDisabled }}
        disabled={isDisabled}
        className={
          placement === "header"
            ? "h-[52px] w-[55px] translate-x-[19px] translate-y-0.5 items-center justify-center active:opacity-75"
            : placement === "comment"
              ? "size-12 items-center justify-center active:opacity-75"
              : "size-12 flex-row items-center justify-end active:opacity-75"
        }
        onPress={(event) => {
          event.stopPropagation();
          if (isDisabled) return;
          if (isClosing.current && anchor !== null) return;
          isClosing.current = false;
          button.current?.measureInWindow((x, y, buttonWidth, buttonHeight) => {
            setAnchor({ x, y, width: buttonWidth, height: buttonHeight });
            setOpen(true);
            onOpenChange?.(true);
          });
        }}
      >
        <KebabIcon
          color={isDisabled ? colors.gray[400] : colors.gray[placement === "comment" ? 500 : 900]}
        />
      </Pressable>
      {anchor && (
        <Modal
          visible={isNativeVisible}
          transparent
          statusBarTranslucent
          navigationBarTranslucent
          animationType="none"
          onRequestClose={() => close()}
          onDismiss={Platform.OS === "ios" ? finish : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={placement === "comment" ? "댓글 메뉴 닫기" : "게시글 메뉴 닫기"}
            className="absolute inset-0"
            onPress={(event) => {
              event.stopPropagation();
              close();
            }}
          />
          <View
            className="absolute"
            style={{
              left: Math.max(
                16,
                placement !== "feed"
                  ? width - MENU_WIDTH - 24
                  : Math.min(anchor.x + anchor.width - MENU_WIDTH, width - MENU_WIDTH - 16),
              ),
              top: Math.max(
                24,
                Math.min(
                  anchor.y + anchor.height - (placement === "feed" ? 4 : 6),
                  height - MENU_HEIGHT - 24,
                ),
              ),
            }}
          >
            <FloatingToolbar onReport={() => close(onReport)} onBlock={() => close(onBlock)} />
          </View>
        </Modal>
      )}
    </>
  );
}
