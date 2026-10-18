import { useRouter } from "expo-router";

import { LoadingDialog } from "@/components/Loading";
import { TOAST_MESSAGES } from "@/constants/messages";
import { EMPTY_ITEM_SAVE_VALUES, type useItemSave } from "@/hooks/useItemSave";
import { useToast } from "@/hooks/useToast";
import { ItemSavePage } from "@/screens/save/components/ItemSavePage";
import { ProductPageReader } from "@/screens/save/components/ProductPageReader";

type ItemSaveFlowProps = { itemSave: ReturnType<typeof useItemSave> };

export function ItemSaveFlow({ itemSave }: ItemSaveFlowProps) {
  const router = useRouter();
  const showToast = useToast();
  const { save } = itemSave;
  const openProduct = (productId: string) => {
    itemSave.close();
    router.push(`/items/${productId}`);
  };

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

      <ItemSavePage
        key={`save-${itemSave.values?.sourceUrl ?? ""}`}
        visible={itemSave.values !== null}
        hasExtractionFailed={itemSave.hasFailed}
        initialValues={itemSave.values ?? EMPTY_ITEM_SAVE_VALUES}
        onRequestClose={itemSave.close}
        isSubmitting={save.isPending}
        errorMessage={save.isError ? TOAST_MESSAGES.SAVE_012 : undefined}
        onErrorDismiss={save.reset}
        onOpenDuplicate={openProduct}
        onSubmit={(values, folderIds) =>
          save.mutateAsync({ values, folderIds }).then(({ productId, isDuplicate }) => {
            // 폴더를 고르기 전에 확인하지만, 그사이 같은 링크가 저장됐으면 기존 상품으로 보낸다.
            if (isDuplicate) return openProduct(productId);
            itemSave.close();
            showToast(TOAST_MESSAGES.SAVE_011);
            router.navigate("/all");
          })
        }
      />
    </>
  );
}
