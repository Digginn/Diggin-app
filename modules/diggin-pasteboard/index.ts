import { requireOptionalNativeModule } from "expo";

type DigginPasteboardModule = {
  getChangeCount(): number;
  hasWebUrlAsync(): Promise<boolean>;
};

/** iOS에서만 있다. 안드로이드·웹은 붙여넣기 허용 팝업이 없어 클립보드를 바로 읽는다. */
export const DigginPasteboard = requireOptionalNativeModule<DigginPasteboardModule>("DigginPasteboard");
