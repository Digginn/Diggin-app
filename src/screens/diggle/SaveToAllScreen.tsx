import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { cssInterop } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import { FolderError, folderKeys } from "@/api/folders";
import { productKeys, saveProduct } from "@/api/products";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { HelperText, TextField } from "@/components/Field";
import { Spinner } from "@/components/Loading";
import { ActionModal, LoginRequiredModal } from "@/components/modal";
import { WishLevelSelect } from "@/components/WishLevelSelect";
import { TOAST_MESSAGES } from "@/constants/messages";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateFolder } from "@/hooks/useCreateFolder";
import { useFolders } from "@/hooks/useFolders";
import { useToast } from "@/hooks/useToast";
import { startLogin } from "@/lib/loginIntent";
import { FolderManageSheet } from "@/screens/item-detail/components/FolderManageSheet";
import { itemSaveErrorMessage } from "@/screens/save/domain/itemSaveError";
import type { ItemSaveValues } from "@/types/wish-item";

import {
  communitySaveErrors,
  normalizeSaveValues,
  snapshotSaveValues,
} from "./domain/communitySave";
import { useCommunityPost } from "./queries/useCommunity";
import type { CommunityItem } from "./types/community";
import { communityErrorMessage } from "./utils/formatCommunityTime";

const StyledImage = cssInterop(Image, { className: "style" });

export function SaveToAllScreen() {
  const { postId, itemId } = useLocalSearchParams<{ postId?: string; itemId?: string }>();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { session, isRestoring } = useAuth();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/diggle"));
  if (isRestoring) return <Spinner />;
  if (!session)
    return (
      <LoginRequiredModal visible={isFocused} onClose={back} onLogin={() => startLogin(router)} />
    );
  if (typeof postId !== "string" || typeof itemId !== "string")
    return <SaveUnavailable onBack={back} />;
  return (
    <SnapshotSave
      key={`${session.user.id}:${postId}:${itemId}`}
      postId={postId}
      itemId={itemId}
      onBack={back}
    />
  );
}

function SaveUnavailable({
  onBack,
  onRetry,
  message = "아이템 정보를 찾을 수 없습니다.",
}: {
  onBack: () => void;
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="내 ALL에 저장" onBack={onBack} />
      <View className="flex-1 items-center justify-center gap-4 px-margin">
        <Text className="text-gray-700 font-b3">{message}</Text>
        {onRetry && <Button onPress={onRetry}>다시 시도</Button>}
      </View>
    </View>
  );
}

function SnapshotSave({
  postId,
  itemId,
  onBack,
}: {
  postId: string;
  itemId: string;
  onBack: () => void;
}) {
  const result = useCommunityPost(postId);
  if (result.isPending) return <Spinner />;
  const item = result.data?.items.find((candidate) => candidate.id === itemId);
  if (result.data?.isPreview || !item?.name || !item.url) {
    return (
      <SaveUnavailable
        onBack={onBack}
        message={result.isError ? communityErrorMessage(result.error) : undefined}
        onRetry={result.isError ? () => void result.refetch() : undefined}
      />
    );
  }
  return <CommunitySaveForm item={item} onBack={onBack} />;
}

/** 초기 Snapshot으로 초안을 한 번 만든다. 재조회가 사용자의 수정 내용을 덮지 않는다. */
export function CommunitySaveForm({ item, onBack }: { item: CommunityItem; onBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const folders = useFolders();
  const create = useCreateFolder();
  const [values, setValues] = useState(() => snapshotSaveValues(item));
  const [isLevelOpen, setLevelOpen] = useState(false);
  const [isFolderOpen, setFolderOpen] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const isActive = useRef(true);
  useEffect(() => {
    isActive.current = true;
    return () => {
      isActive.current = false;
    };
  }, []);
  const save = useMutation({
    mutationFn: (ids: string[]) => {
      const isOwned = folders.data?.some(
        (folder) => folder.isOwnedItems && ids.includes(folder.id),
      );
      return saveProduct(
        { ...normalizeSaveValues(values), wishLevel: isOwned ? null : values.wishLevel },
        ids,
      );
    },
    onSuccess: (result) => {
      // 로그아웃·계정 변경으로 초안이 사라진 뒤 온 응답은 새 화면에 반영하지 않는다.
      if (!isActive.current) return;
      if (result.isDuplicate) {
        setDuplicateId(result.productId);
        return;
      }
      // 저장은 이미 끝났다. 목록 재조회 실패를 저장 실패로 표시하지 않는다.
      void queryClient.invalidateQueries({ queryKey: productKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      showToast(TOAST_MESSAGES.SAVE_011);
      onBack();
    },
  });
  const errors = communitySaveErrors(values);
  const isValid = !Object.values(errors).some(Boolean);
  const update =
    <K extends "name" | "brand" | "price" | "wishLevel">(key: K) =>
    (value: ItemSaveValues[K]) =>
      setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar title="내 ALL에 저장" onBack={onBack} isDisabled={isFolderOpen} />
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
            <StyledImage
              className="size-[92px] rounded-field bg-gray-100"
              contentFit="cover"
              autoplay={false}
              source={values.thumbnailUrl ?? undefined}
              accessibilityLabel="게시글에 저장된 아이템 이미지"
            />
          </View>
          <View className="gap-2">
            <Text className="text-gray-900 font-b3">아이템명</Text>
            <TextField
              accessibilityLabel="아이템명"
              growsTo={88}
              value={values.name}
              onChangeText={(text) =>
                update("name")(Array.from(splitGraphemes(text)).slice(0, 100).join(""))
              }
              isError={!!errors.name}
            />
            {errors.name && <HelperText status="error" message={errors.name} />}
          </View>
          <View className="gap-2">
            <Text className="text-gray-900 font-b3">브랜드</Text>
            <TextField
              accessibilityLabel="브랜드"
              value={values.brand}
              onChangeText={(text) =>
                update("brand")(Array.from(splitGraphemes(text)).slice(0, 30).join(""))
              }
              isError={!!errors.brand}
            />
            {errors.brand && <HelperText status="error" message={errors.brand} />}
          </View>
          <View className="gap-2">
            <Text className="text-gray-900 font-b3">가격</Text>
            <TextField
              accessibilityLabel="가격"
              keyboardType="number-pad"
              value={values.price}
              onChangeText={update("price")}
              isError={!!errors.price}
            />
            {errors.price && <HelperText status="error" message={errors.price} />}
          </View>
          <View className="gap-2">
            <Text className="text-gray-900 font-b3">아이템 링크</Text>
            <TextField accessibilityLabel="아이템 링크" value={values.sourceUrl} editable={false} />
          </View>
        </View>
        <View className="h-8 flex-row items-center justify-between">
          <Text className="text-gray-900 font-b3">위시레벨</Text>
          <WishLevelSelect
            level={values.wishLevel}
            isOpen={isLevelOpen}
            onToggle={() => setLevelOpen((previous) => !previous)}
            onSelect={(level) => {
              update("wishLevel")(level);
              setLevelOpen(false);
            }}
          />
        </View>
        {folders.isError && (
          <View className="gap-2">
            <HelperText status="error" message="폴더를 불러오지 못했습니다. 다시 시도해 주세요." />
            <Button variant="secondary" onPress={() => void folders.refetch()}>
              폴더 다시 불러오기
            </Button>
          </View>
        )}
      </ScrollView>
      <View className="px-margin pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button
          isDisabled={!isValid || folders.isPending || folders.isError}
          onPress={() => {
            setLevelOpen(false);
            setFolderOpen(true);
          }}
        >
          폴더 선택하기
        </Button>
      </View>
      {isFolderOpen && (
        <FolderManageSheet
          isNewItem
          title="저장할 폴더 선택"
          completeLabel="저장하기"
          folders={folders.data ?? []}
          selectedFolderIds={[]}
          isCompleting={save.isPending}
          errorMessage={save.isError ? itemSaveErrorMessage(save.error) : undefined}
          onErrorDismiss={save.reset}
          onBack={() => setFolderOpen(false)}
          onClose={() => setFolderOpen(false)}
          onCreateFolder={async (name) => {
            const folder = await create.mutateAsync(name);
            if (!isActive.current) return folder;
            // 재조회가 늦어도 방금 만든 폴더를 바로 선택할 수 있다.
            queryClient.setQueryData(folderKeys.list(), (previous: typeof folders.data) =>
              previous?.some((entry) => entry.id === folder.id)
                ? previous
                : [folder, ...(previous ?? [])],
            );
            return folder;
          }}
          getCreateErrorMessage={(error) =>
            error instanceof FolderError
              ? error.reason === "limit"
                ? "폴더는 최대 50개까지 만들 수 있습니다."
                : error.reason === "duplicate"
                  ? "같은 이름의 폴더가 있습니다."
                  : "폴더를 만들지 못했습니다. 다시 시도해 주세요."
              : "폴더를 만들지 못했습니다. 다시 시도해 주세요."
          }
          onComplete={(ids) => save.mutateAsync(ids)}
          overlay={
            duplicateId ? (
              <ActionModal
                visible
                type="2Btn"
                title="이미 저장한 아이템입니다."
                description="기존에 저장한 아이템을 확인하시겠습니까?"
                secondaryAction={{ label: "괜찮아요", onPress: onBack }}
                primaryAction={{
                  label: "확인하기",
                  onPress: () => router.replace(`/items/${duplicateId}`),
                }}
                onRequestClose={onBack}
              />
            ) : undefined
          }
        />
      )}
    </View>
  );
}
