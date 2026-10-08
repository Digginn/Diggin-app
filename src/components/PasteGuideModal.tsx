import { cssInterop } from "nativewind";
import { Text, View } from "react-native";

import InfoSvg from "@/assets/images/icon-product-info.svg";
import { Button } from "@/components/Button";
import { Modal } from "@/components/modal";

const InfoIcon = cssInterop(InfoSvg, {
  className: { target: "style", nativeStyleToProp: { width: true, height: true } },
});

type PasteGuideModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onOpenSettings: () => void;
};

export function PasteGuideModal({ visible, onRequestClose, onOpenSettings }: PasteGuideModalProps) {
  return (
    <Modal visible={visible} onRequestClose={onRequestClose} className="px-2.5 pb-4 pt-[18px]">
      {/* 시안 Header gap-16 > TitleWrap gap-4 */}
      <View className="w-full items-center gap-4">
        <View className="w-full items-center gap-1">
          <View className="flex-row items-start justify-center gap-1">
            <View className="size-6 items-center justify-center">
              <InfoIcon className="size-5" />
            </View>
            <Text className="text-gray-900 font-label-16-semibold">다음부터 바로 불러오기</Text>
          </View>
          <Text className="text-center text-gray-600 font-b3">
            설정에서 &apos;다른 앱에서 붙여넣기&apos;를 &apos;허용&apos;으로 바꾸면 확인 팝업 없이
            아이템 링크를 바로 불러올 수 있어요.
          </Text>
        </View>

        <View className="w-full items-center overflow-hidden rounded bg-gray-100 p-3">
          <Text className="text-center text-gray-900 font-label-13-semibold">
            설정 › DIGGIN › 다른 앱에서 붙여넣기 › 허용
          </Text>
        </View>
      </View>

      <View className="w-full flex-row items-center gap-modal-action">
        <Button className="flex-1" variant="secondary" onPress={onRequestClose}>
          다음에 하기
        </Button>
        <Button className="w-[140px]" onPress={onOpenSettings}>
          설정으로 이동
        </Button>
      </View>
    </Modal>
  );
}
