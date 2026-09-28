import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ActionModal, FolderModal, ReportModal } from "@/components/modal";

type PreviewModal = "folder" | "folderWithActions" | "link" | "report" | null;

function FolderNameField() {
  return (
    <View className="w-[295px] gap-2">
      <Text className="text-gray-1000 font-b3">폴더 이름</Text>
      <TextInput
        className="h-11 rounded-[5px] border border-gray-300 px-4 py-0 text-gray-700 font-label-16-medium"
        defaultValue="새 폴더"
        textAlignVertical="center"
      />
    </View>
  );
}

export default function ModalPreview() {
  const [previewModal, setPreviewModal] = useState<PreviewModal>(null);
  const closeModal = () => setPreviewModal(null);

  return (
    <View className="flex-1 bg-gray-100">
      <ScrollView contentContainerClassName="gap-4 px-margin py-16">
        <Text className="text-gray-900 font-h1">Modal</Text>
        <Text className="text-gray-700 font-b3">버튼을 눌러 모달 상태를 확인하세요.</Text>
        <Pressable
          className="h-12 items-center justify-center rounded-[5px] bg-gray-900"
          onPress={() => setPreviewModal("folder")}
        >
          <Text className="text-gray-0 font-label-16-semibold">Modal1 (1Btn) 열기</Text>
        </Pressable>
        <Pressable
          className="h-12 items-center justify-center rounded-[5px] bg-gray-900"
          onPress={() => setPreviewModal("folderWithActions")}
        >
          <Text className="text-gray-0 font-label-16-semibold">Modal1 (2Btn) 열기</Text>
        </Pressable>
        <Pressable
          className="h-12 items-center justify-center rounded-[5px] bg-gray-900"
          onPress={() => setPreviewModal("link")}
        >
          <Text className="text-gray-0 font-label-16-semibold">Modal2 열기</Text>
        </Pressable>
        <Pressable
          className="h-12 items-center justify-center rounded-[5px] bg-gray-900"
          onPress={() => setPreviewModal("report")}
        >
          <Text className="text-gray-0 font-label-16-semibold">ModalReport 열기</Text>
        </Pressable>
      </ScrollView>
      {previewModal === "folder" && (
        <ActionModal
          visible
          onRequestClose={closeModal}
          type="1Btn"
          title="새 폴더 만들기"
          description={`아이템을 담을 새 폴더를 만들어 주세요.
공개 폴더는 외부 링크로 공유가 가능해요.`}
          onClose={closeModal}
          primaryAction={{ label: "폴더 만들기", onPress: closeModal }}
        >
          <FolderNameField />
        </ActionModal>
      )}
      {previewModal === "folderWithActions" && (
        <ActionModal
          visible
          onRequestClose={closeModal}
          type="2Btn"
          title="새 폴더 만들기"
          description={`아이템을 담을 새 폴더를 만들어 주세요.
공개 폴더는 외부 링크로 공유가 가능해요.`}
          primaryAction={{ label: "폴더 만들기", onPress: closeModal }}
          secondaryAction={{ label: "돌아가기", onPress: closeModal }}
        >
          <FolderNameField />
        </ActionModal>
      )}
      {previewModal === "link" && (
        <FolderModal
          visible
          onRequestClose={closeModal}
          title="제목"
          productName="상품명"
          description="소제목 혹은 설명글이 들어갑니다. 1줄만 노출"
          selectedFolderName="기본 폴더"
          onPressFolderSelect={() => Alert.alert("폴더 선택", "목록 UI는 추후 연결 예정입니다.")}
          onBack={closeModal}
          onLoad={closeModal}
          onSave={closeModal}
        />
      )}
      {previewModal === "report" && (
        <ReportModal
          visible
          onRequestClose={closeModal}
          onCancel={closeModal}
          onReport={closeModal}
        />
      )}
    </View>
  );
}
