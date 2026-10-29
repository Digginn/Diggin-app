export type CsvImportProgress = { completed: number; total: number };

export type CsvExcludedProduct = {
  id: string;
  productName: string;
  reason: string;
  kind: "failed" | "duplicate";
};

export type CsvImportResult = {
  importedCount: number;
  excludedProducts: CsvExcludedProduct[];
  folderFailures?: CsvFolderFailure[];
};

export type CsvImportFailure = {
  error: "missing-product-info" | "file-too-large" | "invalid-encoding" | "login-required";
};

export type CsvFileError =
  "INVALID_FILE_TYPE" | "FILE_TOO_LARGE" | "INVALID_UTF8" | "INVALID_HEADERS";

export type CsvRowFailureReason =
  | "EMPTY_PRODUCT_NAME"
  | "EMPTY_PRODUCT_URL"
  | "INVALID_PRODUCT_URL"
  | "CSV_ROW_PARSE_ERROR"
  | "RESTRICTED_PRODUCT";

export type CsvRowFailure = {
  rowNumber: number;
  productName: string;
  reason: CsvRowFailureReason;
};

export type CsvDuplicateRow = {
  rowNumber: number;
  productName: string;
  url: string;
};

export type CsvPlannedProduct = {
  restrictionLabels?: string[];
  rowNumber: number;
  name: string;
  url: string;
  brand: string | null;
  // DB 정수 범위를 넘는 값은 서버가 가격 정보 없음으로 처리한다.
  price: string | null;
  savedAt: string;
  imageUrl: null;
  wishLevel: null;
  folderNames: string[];
  // 서버가 실제 폴더 수를 확인한 뒤 연결하므로 한도로 제외된 버킷도 보존한다.
  sourceFolderNames: string[];
  isOwned: boolean;
};

export type CsvExistingProduct = {
  id: string;
  url: string;
  folderNames: readonly string[];
  isOwned: boolean;
};

export type CsvExistingProductUpdate = {
  productId: string;
  addFolderNames: string[];
  addOwnedFolder: boolean;
};

export type CsvFolderMapping = {
  sourceName: string;
  folderName: string;
};

export type CsvFolderFailure = {
  rowNumber: number;
  productName: string;
  sourceFolderName: string;
  reason: "FOLDER_LIMIT_EXCEEDED" | "FOLDER_SAVE_FAILED";
};

/** 저장 전 계획이다. 이 수치를 UI의 저장 성공 결과로 사용하지 않는다. */
export type CsvImportPlan = {
  totalCount: number;
  newProductCount: number;
  failedCount: number;
  duplicateCount: number;
  products: CsvPlannedProduct[];
  existingProductUpdates: CsvExistingProductUpdate[];
  foldersToCreate: string[];
  folderMappings: CsvFolderMapping[];
  // 폴더 실패는 상품 행 실패와 별개다. 상품 및 성공한 관계는 유지한다.
  folderFailures: CsvFolderFailure[];
  failures: CsvRowFailure[];
  duplicates: CsvDuplicateRow[];
};

export type CsvImportPreparation =
  { ok: true; plan: CsvImportPlan } | { ok: false; error: CsvFileError };
