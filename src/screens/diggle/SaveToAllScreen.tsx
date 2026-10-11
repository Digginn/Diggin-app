import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CameraSvg from "@/assets/images/icon-camera.svg";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { WishLevelSelect } from "@/components/WishLevelSelect";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useToast } from "@/hooks/useToast";
import {
  FolderManageSheet,
  type ManagedFolder,
} from "@/screens/item-detail/components/FolderManageSheet";
import { colors } from "@/theme";
import type { WishLevelKey } from "@/types/wish-item";

import { MOCK_FOLDERS } from "./constants/mockPosts";

const StyledImage = cssInterop(Image, { className: "style" });

// 아이템명이 길면 88 까지 자란다. 시안 TextField 의 min-h-44 / max-h-88 이다.
const NAME_MAX_HEIGHT = 88;

type SaveToAllValues = {
  name: string;
  price: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  wishLevel: WishLevelKey | null;
};

// TODO: API 연결 시 아이템 상세 조회 응답으로 채운다.
const INITIAL_VALUES: SaveToAllValues = {
  name: "Real Good Pants 엄청 좋은 바지",
  price: "70000",
  sourceUrl: "http://pf.kakao.com/_zIxnrX",
  thumbnailUrl: null,
  wishLevel: null,
};

export function SaveToAllScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useToast();

  const [values, setValues] = useState(INITIAL_VALUES);
  const [isLevelOpen, setLevelOpen] = useState(false);
  const [isFolderOpen, setFolderOpen] = useState(false);
  const [folders, setFolders] = useState<ManagedFolder[]>(MOCK_FOLDERS);

  const update =
    <K extends keyof SaveToAllValues>(key: K) =>
    (value: SaveToAllValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="내 ALL에 저장" onBack={() => router.back()} isDisabled={isFolderOpen} />

      <ScrollView
        className="px-margin"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24, gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-gray-700 font-b3">
          작성자가 저장한 정보를 그대로 불러왔습니다.{"\n"}필요한 내용을 수정해 주세요.
        </Text>

        <View className="gap-gutter">
          <View className="gap-2">
            <Text className="text-gray-900 font-b3">아이템 이미지</Text>
            <View className="w-[92px]">
              <StyledImage
                className="size-[92px] rounded-field bg-gray-100"
                contentFit="cover"
                source={values.thumbnailUrl ?? undefined}
              />
              <Pressable
                accessibilityLabel="아이템 이미지 변경"
                accessibilityRole="button"
                className="absolute bottom-0 right-0 size-6 items-center justify-center rounded-field bg-gray-0 active:opacity-75"
                hitSlop={12}
                // TODO: 이미지 피커 연결.
                onPress={() => {}}
              >
                <CameraSvg width={14} height={12} color={colors.gray[900]} />
              </Pressable>
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-gray-900 font-b3">아이템명</Text>
            <TextField
              growsTo={NAME_MAX_HEIGHT}
              value={values.name}
              onChangeText={update("name")}
            />
          </View>

          <View className="gap-2">
            <Text className="text-gray-900 font-b3">가격</Text>
            <TextField
              keyboardType="number-pad"
              value={values.price}
              onChangeText={update("price")}
            />
          </View>

          <View className="gap-2">
            <Text className="text-gray-900 font-b3">아이템 링크</Text>
            <TextField value={values.sourceUrl} onChangeText={update("sourceUrl")} />
          </View>
        </View>

        <View className="h-8 flex-row items-center justify-between">
          <Text className="text-gray-900 font-b3">위시레벨</Text>
          <WishLevelSelect
            level={values.wishLevel}
            isOpen={isLevelOpen}
            onToggle={() => setLevelOpen((prev) => !prev)}
            onSelect={(level) => {
              update("wishLevel")(level);
              setLevelOpen(false);
            }}
          />
        </View>
      </ScrollView>

      <View className="px-margin pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button onPress={() => setFolderOpen(true)}>폴더 선택하기</Button>
      </View>

      {isFolderOpen && (
        <FolderManageSheet
          title="저장할 폴더 선택"
          completeLabel="저장하기"
          folders={folders}
          selectedFolderIds={[]}
          onBack={() => setFolderOpen(false)}
          onClose={() => setFolderOpen(false)}
          onCreateFolder={(name) => {
            // TODO: 폴더 생성 API 연결.
            const folder = { id: `folder-${Date.now()}`, name };
            setFolders((prev) => [folder, ...prev]);
            return folder;
          }}
          onComplete={() => {
            // TODO: 내 ALL에 저장 API 연결.
            setFolderOpen(false);
            router.back();
            showToast(TOAST_MESSAGES.SAVE_011);
          }}
        />
      )}
    </View>
  );
}
