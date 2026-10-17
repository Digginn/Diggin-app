import { useRouter } from "expo-router";

import { LoadingDialog } from "@/components/Loading";
import { TOAST_MESSAGES } from "@/constants/messages";
import { EMPTY_ITEM_SAVE_VALUES, type useItemSave } from "@/hooks/useItemSave";
import { useToast } from "@/hooks/useToast";
import { ItemEditSheet } from "@/screens/item-detail/components/ItemEditSheet";

type ItemSaveFlowProps = { itemSave: ReturnType<typeof useItemSave> };

/** 링크 불러오기 로딩과 저장 시트. 클립보드 감지와 ALL 링크 입력이 같이 쓴다. */
export function ItemSaveFlow({ itemSave }: ItemSaveFlowProps) {
  const router = useRouter();
  const showToast = useToast();
  const { save } = itemSave;
  const duplicateId = save.data?.isDuplicate ? save.data.productId : undefined;

  return (
    <>
      <LoadingDialog
        visible={itemSave.isLoading}
        message="아이템 정보를 불러오는 중입니다."
        onDismiss={itemSave.openAfterLoading}
      />

      <ItemEditSheet
        key={`save-${itemSave.values?.sourceUrl ?? ""}`}
        visible={itemSave.values !== null}
        hasExtractionFailed={itemSave.hasFailed}
        initialValues={itemSave.values ?? EMPTY_ITEM_SAVE_VALUES}
        onRequestClose={itemSave.close}
        isSubmitting={save.isPending}
        errorMessage={save.isError ? TOAST_MESSAGES.SAVE_012 : undefined}
        onErrorDismiss={save.reset}
        // SAVE-012 같은 링크는 저장하지 않고 기존 상품으로 안내한다.
        duplicate={
          duplicateId
            ? {
                onConfirm: () => {
                  itemSave.close();
                  router.push(`/items/${duplicateId}`);
                },
                onDismiss: itemSave.close,
              }
            : undefined
        }
        onSubmit={(values) =>
          save.mutate(values, {
            onSuccess: ({ isDuplicate }) => {
              if (isDuplicate) return;
              itemSave.close();
              showToast(TOAST_MESSAGES.SAVE_011);
              // SAVE-014 저장한 상품이 맨 위에 있는 ALL로 보낸다.
              router.navigate("/all");
            },
          })
        }
      />
    </>
  );
}
