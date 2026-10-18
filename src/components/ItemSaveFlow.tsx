import { useRouter } from "expo-router";

import { LoadingDialog } from "@/components/Loading";
import { TOAST_MESSAGES } from "@/constants/messages";
import { EMPTY_ITEM_SAVE_VALUES, type useItemSave } from "@/hooks/useItemSave";
import { useToast } from "@/hooks/useToast";
import { ItemEditSheet } from "@/screens/item-detail/components/ItemEditSheet";
import { ProductPageReader } from "@/screens/save/components/ProductPageReader";

type ItemSaveFlowProps = { itemSave: ReturnType<typeof useItemSave> };

export function ItemSaveFlow({ itemSave }: ItemSaveFlowProps) {
  const router = useRouter();
  const showToast = useToast();
  const { save } = itemSave;
  const duplicateId = save.data?.isDuplicate ? save.data.productId : undefined;

  return (
    <>
      {itemSave.readingUrl ? (
        <ProductPageReader
          key={itemSave.readingUrl}
          url={itemSave.readingUrl}
          onDone={itemSave.finishReading}
        />
      ) : null}

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
              router.navigate("/all");
            },
          })
        }
      />
    </>
  );
}
