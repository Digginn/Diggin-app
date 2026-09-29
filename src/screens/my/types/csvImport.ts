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
};

export type CsvImportFailure = { error: "missing-product-info" };
