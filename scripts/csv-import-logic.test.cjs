/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const Papa = require("papaparse");
const ts = require("typescript");

const domainModule = { exports: {} };
runInNewContext(
  ts.transpileModule(
    readFileSync(path.join(__dirname, "../src/screens/my/domain/prepareCsvImport.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  ).outputText,
  {
    module: domainModule,
    exports: domainModule.exports,
    require,
    TextDecoder,
    URL,
  },
);
const { prepareCsvImport, CSV_REQUIRED_HEADERS, MAX_CSV_BYTES } = domainModule.exports;
const HEADERS = [...CSV_REQUIRED_HEADERS];
const IMPORTED_AT = "2026-10-14T12:00:00.000Z";
const OPTIONS = {
  importedAt: IMPORTED_AT,
  registeredAtUtcOffsetMinutes: 540,
  existingFolderNames: [],
  isKrw: ({ hostname }) => hostname === "krw.example",
};

function product(overrides = {}) {
  return {
    "상품명": "운동화",
    "스토어명": "스토어",
    "브랜드명": "브랜드",
    "정가": "10000",
    "할인가": "8000",
    "등록일": "2026-10-12 09:00:00",
    "버킷명": "신발",
    "소장템 여부": "N",
    "상품 링크": "https://krw.example/item/1",
    ...overrides,
  };
}

function file(rows, headers = HEADERS) {
  return {
    name: "wishlist.csv",
    bytes: new TextEncoder().encode(
      Papa.unparse([headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))]),
    ),
  };
}

function plan(rows, options = OPTIONS) {
  const result = prepareCsvImport(file(rows), options);
  assert.equal(result.ok, true);
  // VM에서 생성한 객체는 다른 realm의 prototype을 가진다.
  return JSON.parse(JSON.stringify(result.plan));
}

function assertCounts(result) {
  assert.equal(
    result.totalCount,
    result.newProductCount + result.failedCount + result.duplicateCount,
  );
}

test("BOM·공백 Header·임의 Header 순서·추가 Column을 처리한다", () => {
  const headers = ["추가", ...HEADERS.toReversed()];
  const selected = file([product({ 추가: "무시할 값" })], headers);
  const csv = new TextDecoder().decode(selected.bytes);
  selected.name = "wishlist.CSV";
  selected.bytes = new TextEncoder().encode(
    `\uFEFF${csv.replace(headers.join(","), headers.map((h) => ` ${h} `).join(","))}`,
  );
  const result = prepareCsvImport(selected, OPTIONS);
  assert.equal(result.ok, true);
  assert.equal(result.plan.products[0].name, "운동화");
  assert.equal(result.plan.products[0].price, "8000");
  assert.equal("추가" in result.plan.products[0], false);
  assert.equal("storeName" in result.plan.products[0], false);
});

test("확장자·실제 바이트 크기·잘못된 UTF-8을 파일 전체 오류로 구분한다", () => {
  assert.equal(
    prepareCsvImport({ ...file([product()]), name: "wishlist.csv.exe" }, OPTIONS).error,
    "INVALID_FILE_TYPE",
  );
  assert.equal(
    prepareCsvImport({ name: "wishlist.csv", bytes: new Uint8Array(MAX_CSV_BYTES + 1) }, OPTIONS)
      .error,
    "FILE_TOO_LARGE",
  );
  for (const bytes of [
    new Uint8Array([0xff]),
    new Uint8Array([0xed, 0xa0, 0x80]),
    new Uint8Array([0xe3, 0x81]),
  ]) {
    assert.equal(prepareCsvImport({ name: "wishlist.csv", bytes }, OPTIONS).error, "INVALID_UTF8");
  }
  const content = file([product()]).bytes;
  const exactLimit = new Uint8Array(MAX_CSV_BYTES).fill(32);
  exactLimit.set(content);
  assert.equal(prepareCsvImport({ name: "wishlist.csv", bytes: exactLimit }, OPTIONS).ok, true);
});

test("필수 Header 누락·공백 정규화 후 중복 Header·빈 파일은 차단한다", () => {
  for (const headers of [
    HEADERS.slice(1),
    [...HEADERS, " 상품명 "],
    [...HEADERS, "추가", " 추가 "],
  ]) {
    assert.equal(prepareCsvImport(file([product()], headers), OPTIONS).error, "INVALID_HEADERS");
  }
  assert.equal(
    prepareCsvImport({ name: "wishlist.csv", bytes: new Uint8Array() }, OPTIONS).error,
    "INVALID_HEADERS",
  );
  const result = prepareCsvImport(file([]), OPTIONS);
  assert.equal(result.ok, true);
  assert.equal(result.plan.totalCount, 0);
});

test("quoted 쉼표·큰따옴표 escape·개행을 보존하며 원본 물리 행 번호를 표시한다", () => {
  const result = plan([
    product({ 상품명: '한정판, "운동화"\n두 번째 줄', 버킷명: " 신발, 선물,신발 " }),
    product({ "상품명": "", "상품 링크": "https://krw.example/item/2" }),
  ]);
  assert.equal(result.products[0].name, '한정판, "운동화"\n두 번째 줄');
  assert.deepEqual(result.products[0].folderNames, ["신발", "선물"]);
  assert.equal(result.failures[0].rowNumber, 4);
  assertCounts(result);
});

test("필수값 누락·HTTP/상대/잘못된 URL·Column 수 오류는 해당 행만 실패한다", () => {
  const rows = [
    product({ 상품명: " " }),
    product({ "상품 링크": " " }),
    product({ "상품 링크": "http://krw.example/item/1" }),
    product({ "상품 링크": "/item/1" }),
    product({ "상품 링크": "https://" }),
    product({ "상품 링크": "javascript:alert(1)" }),
    product({ "상품 링크": " https://krw.example/item/1" }),
    product(),
  ];
  const selected = file(rows);
  const text = new TextDecoder().decode(selected.bytes);
  selected.bytes = new TextEncoder().encode(
    `${text}\r\nbad,row\r\n${Papa.unparse([HEADERS.map((h) => product({ "상품 링크": "https://krw.example/item/2" })[h])])}`,
  );
  const result = prepareCsvImport(selected, OPTIONS).plan;
  assert.equal(result.products.length, 2);
  assert.equal(result.failures[0].reason, "EMPTY_PRODUCT_NAME");
  assert.equal(result.failures[1].reason, "EMPTY_PRODUCT_URL");
  assert.equal(result.failures[2].reason, "INVALID_PRODUCT_URL");
  assert.equal(result.failures[7].reason, "CSV_ROW_PARSE_ERROR");
  assertCounts(result);
});

test("행 파싱 오류가 있어도 앞선 정상 행은 유지하고 빈 줄은 대상에서 제외한다", () => {
  const selected = file([product()]);
  const text = new TextDecoder().decode(selected.bytes);
  selected.bytes = new TextEncoder().encode(`${text}\r\n\r\n"닫히지 않은 상품`);
  const result = prepareCsvImport(selected, OPTIONS).plan;
  assert.equal(result.newProductCount, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.failures[0].reason, "CSV_ROW_PARSE_ERROR");
  assert.equal(result.failures[0].rowNumber, 4);
  assertCounts(result);
});

test("KRW 확인 시 유효 할인가 우선, 0원 유지, 선택값 오류는 행 성공으로 유지한다", () => {
  for (const [values, expected] of [
    [{ 할인가: "0", 정가: "100" }, "0"],
    [{ 할인가: "", 정가: "1,200" }, "1200"],
    [{ 할인가: "-1", 정가: "100" }, "100"],
    [{ 할인가: "1.5", 정가: "1.5" }, null],
    [{ 할인가: "", 정가: "" }, null],
    [{ 할인가: "NaN", 정가: "Infinity" }, null],
    [{ 할인가: "00080", 정가: "100" }, "80"],
    [{ 할인가: "90071992547409931234567890" }, "90071992547409931234567890"],
  ]) {
    const result = plan([product(values)]);
    assert.equal(result.products[0].price, expected);
    assert.equal(result.failedCount, 0);
  }
  assert.equal(plan([product()], { ...OPTIONS, isKrw: undefined }).products[0].price, null);
  assert.equal(
    plan([product({ "상품 링크": "https://foreign.example/item" })]).products[0].price,
    null,
  );
  const result = plan([product({ "브랜드명": " ", "소장템 여부": "INVALID", "버킷명": "" })]);
  assert.equal(result.products[0].brand, null);
  assert.equal(result.products[0].isOwned, false);
  assert.deepEqual(result.products[0].folderNames, []);
});

test("유효 등록일과 명시적 시간대만 사용하고 날짜 오류는 동일 Import 시각으로 대체한다", () => {
  assert.equal(plan([product()]).products[0].savedAt, "2026-10-12T00:00:00.000Z");
  assert.equal(
    plan([product()], { ...OPTIONS, registeredAtUtcOffsetMinutes: 0 }).products[0].savedAt,
    "2026-10-12T09:00:00.000Z",
  );
  for (const 등록일 of [
    "",
    "2026-02-29 10:00:00",
    "2026-04-31 00:00:00",
    "2026-10-12 24:00:00",
    "2026-10-12T09:00:00",
    "2026-10-12 09:00:60",
  ]) {
    assert.equal(plan([product({ 등록일 })]).products[0].savedAt, IMPORTED_AT);
  }
  assert.equal(
    plan([product({ 등록일: "2024-02-29 00:00:00" })]).products[0].savedAt,
    "2024-02-28T15:00:00.000Z",
  );
  assert.throws(() => plan([product()], { ...OPTIONS, importedAt: "invalid" }), /시각/);
  assert.throws(
    () => plan([product()], { ...OPTIONS, registeredAtUtcOffsetMinutes: NaN }),
    /시간대/,
  );
});

test("동일 파일 중복은 최신 정보·모든 폴더·소장 Y의 합집합으로 병합한다", () => {
  const result = plan([
    product({
      "상품명": "오래된 이름",
      "등록일": "2026-10-01 00:00:00",
      "버킷명": "신발, 선물",
      "소장템 여부": "Y",
    }),
    product({
      상품명: "최신 이름",
      등록일: "2026-10-13 09:00:00",
      브랜드명: "새 브랜드",
      할인가: "0",
      버킷명: "패션,신발",
    }),
    product({ 상품명: "중간 이름", 등록일: "2026-10-05 00:00:00", 버킷명: "여행" }),
  ]);
  assert.equal(result.newProductCount, 1);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.products[0].name, "최신 이름");
  assert.equal(result.products[0].brand, "새 브랜드");
  assert.equal(result.products[0].price, "0");
  assert.deepEqual(result.products[0].folderNames, ["신발", "선물", "패션", "여행"]);
  assert.equal(result.products[0].isOwned, true);
  assert.equal(result.products[0].wishLevel, null);
  assert.equal(result.products[0].imageUrl, null);
  assert.deepEqual(
    result.duplicates.map((row) => row.rowNumber),
    [2, 4],
  );
  assertCounts(result);
});

test("기존 ALL 중복은 상품 정보를 건드리지 않고 누락 관계만 계산한다", () => {
  const existingProducts = [
    Object.freeze({
      id: "product-1",
      url: "https://krw.example/item/1",
      folderNames: Object.freeze(["신발"]),
      isOwned: false,
    }),
  ];
  const before = JSON.stringify(existingProducts);
  const result = plan(
    [
      product({ 상품명: "덮어쓰면 안 되는 정보", 버킷명: "신발, 선물" }),
      product({ "버킷명": "여행", "소장템 여부": "Y" }),
    ],
    { ...OPTIONS, existingProducts, existingFolderNames: ["신발"] },
  );
  assert.deepEqual(result.products, []);
  assert.equal(result.duplicateCount, 2);
  assert.deepEqual(result.existingProductUpdates, [
    { productId: "product-1", addFolderNames: ["선물", "여행"], addOwnedFolder: true },
  ]);
  assert.equal(JSON.stringify(existingProducts), before);
  assertCounts(result);
  const repeated = plan([product({ "버킷명": "신발", "소장템 여부": "Y" })], {
    ...OPTIONS,
    existingFolderNames: ["신발", "선물", "여행"],
    previousFolderMappings: result.folderMappings,
    existingProducts: [
      { ...existingProducts[0], folderNames: ["신발", "선물", "여행"], isOwned: true },
    ],
  });
  assert.deepEqual(repeated.existingProductUpdates, []);
  assert.equal(repeated.duplicateCount, 1);
});

test("폴더명은 공통 7자 규칙으로 자르고 소장템 이름 충돌도 숫자로 해소한다", () => {
  const result = plan([
    product({ 버킷명: " 맥북 파우치 16inch,삭스/레그워머 🧦,헤어핀/헤어밴드,나의 소장템 " }),
  ]);
  assert.deepEqual(result.products[0].folderNames, [
    "맥북 파우치",
    "삭스/레그워머",
    "헤어핀/헤어밴",
    "나의 소장템2",
  ]);
  assert.equal(result.products[0].isOwned, false);
});

test("상품명·브랜드명은 NFC와 앞뒤 공백 제거 후 100자·30자로 자른다", () => {
  const family = "👨‍👩‍👧‍👦";
  const result = plan([
    product({ 상품명: ` ${family.repeat(101)} `, 브랜드명: ` ${"e\u0301".repeat(31)} ` }),
  ]);
  assert.equal(result.products[0].name, family.repeat(Math.floor(100 / [...family].length)));
  assert.equal(result.products[0].brand, "é".repeat(30));
  assert.equal(result.failedCount, 0);
  assert.equal(plan([product({ 상품명: " \u1100\u1161 ", 브랜드명: " " })]).products[0].name, "가");
  assert.equal(plan([product({ 브랜드명: " " })]).products[0].brand, null);
});

test("다른 원본 버킷의 7자 후보 충돌은 2부터 해소하고 같은 원본은 매핑을 재사용한다", () => {
  const result = plan([
    product({ 버킷명: "abcdefg-one,abcdefg-two,abcdef2" }),
    product({ "버킷명": " abcdefg-one ,abcdefg-two", "상품 링크": "https://krw.example/item/2" }),
  ]);
  assert.deepEqual(result.folderMappings, [
    { sourceName: "abcdefg-one", folderName: "abcdefg" },
    { sourceName: "abcdefg-two", folderName: "abcdef2" },
    { sourceName: "abcdef2", folderName: "abcdef3" },
  ]);
  assert.deepEqual(result.products[0].folderNames, ["abcdefg", "abcdef2", "abcdef3"]);
  assert.deepEqual(result.products[1].folderNames, ["abcdefg", "abcdef2"]);
  assert.deepEqual(result.foldersToCreate, ["abcdefg", "abcdef2", "abcdef3"]);
});

test("기존 폴더와 충돌 시 가장 작은 번호를 쓰고 두 자리 번호도 총 7자에 맞춘다", () => {
  const rows = [product({ 버킷명: "abcdefg-long" })];
  const first = plan(rows, { ...OPTIONS, existingFolderNames: ["abcdefg", "abcdef2", "abcdef4"] });
  assert.equal(first.products[0].folderNames[0], "abcdef3");
  const second = plan(rows, {
    ...OPTIONS,
    existingFolderNames: ["abcdefg", ...Array.from({ length: 8 }, (_, i) => `abcdef${i + 2}`)],
  });
  assert.equal(second.products[0].folderNames[0], "abcde10");
  assert.equal(second.folderFailures.length, 0);
});

test("원본 버킷명이 기존 폴더명과 같으면 여러 행을 기존 폴더에 담는다", () => {
  const result = plan(
    [
      product({ 버킷명: " 신발,선물,신발 " }),
      product({ "버킷명": "신발", "상품 링크": "https://krw.example/item/2" }),
    ],
    { ...OPTIONS, existingFolderNames: ["신발"] },
  );
  assert.deepEqual(result.foldersToCreate, ["선물"]);
  assert.deepEqual(
    result.products.map((p) => p.folderNames),
    [["신발", "선물"], ["신발"]],
  );
  assert.deepEqual(result.folderMappings, [
    { sourceName: "신발", folderName: "신발" },
    { sourceName: "선물", folderName: "선물" },
  ]);
  assert.deepEqual(result.folderFailures, []);
  assertCounts(result);
});

test("50개일 때 기존 폴더 재사용은 허용하고 새 버킷의 상품은 ALL에만 남긴다", () => {
  const existingFolderNames = Array.from({ length: 50 }, (_, i) => `폴더${i}`);
  const rows = [
    product({ 버킷명: "폴더0" }),
    product({ "버킷명": "새폴더", "상품 링크": "https://krw.example/item/2" }),
  ];
  const full = plan(rows, { ...OPTIONS, existingFolderNames });
  assert.deepEqual(full.foldersToCreate, []);
  assert.deepEqual(
    full.products.map((p) => p.folderNames),
    [["폴더0"], []],
  );
  assert.deepEqual(
    full.folderFailures.map((f) => f.sourceFolderName),
    ["새폴더"],
  );
  assert.equal(full.newProductCount, 2);
  assert.equal(full.failedCount, 0);
  assertCounts(full);

  const afterDeletion = plan(rows, {
    ...OPTIONS,
    existingFolderNames: existingFolderNames.slice(0, 49),
  });
  assert.deepEqual(afterDeletion.foldersToCreate, ["새폴더"]);
  assert.deepEqual(
    afterDeletion.products.map((p) => p.folderNames),
    [["폴더0"], ["새폴더"]],
  );
  assert.deepEqual(afterDeletion.folderFailures, []);
});

test("45개에서 신규 버킷 7개 중 5개만 생성하고 기존 폴더는 계속 재사용한다", () => {
  const existingFolderNames = Array.from({ length: 45 }, (_, i) => `폴더${i}`);
  const rows = Array.from({ length: 7 }, (_, i) =>
    product({ "버킷명": `신규${i}`, "상품 링크": `https://krw.example/item/new-${i}` }),
  );
  rows.push(product({ "버킷명": "폴더0", "상품 링크": "https://krw.example/item/existing" }));
  const result = plan(rows, { ...OPTIONS, existingFolderNames });
  assert.deepEqual(result.foldersToCreate, ["신규0", "신규1", "신규2", "신규3", "신규4"]);
  assert.deepEqual(
    result.products.slice(5, 7).map((p) => p.folderNames),
    [[], []],
  );
  assert.deepEqual(result.products[7].folderNames, ["폴더0"]);
  assert.equal(result.folderFailures.length, 2);
  assert.equal(result.newProductCount, 8);
  assertCounts(result);
});

test("잘린 이름이 기존 폴더와 같으면 번호를 붙이고 원본 일치는 기존 폴더로 보낸다", () => {
  const result = plan([product({ 버킷명: "abcdefg-long,abcdefg,abcdef2" })], {
    ...OPTIONS,
    existingFolderNames: ["abcdefg", "abcdef2"],
  });
  assert.deepEqual(result.products[0].folderNames, ["abcdef3", "abcdefg", "abcdef2"]);
  assert.deepEqual(result.foldersToCreate, ["abcdef3"]);
});

test("이모지·한글 조합을 중간에서 끊지 않고 모든 폴더 후보를 7자로 제한한다", () => {
  const family = "👨‍👩‍👧‍👦";
  const result = plan([product({ 버킷명: family.repeat(8) })]);
  assert.equal(result.products[0].folderNames[0], family.repeat(7));
});

test("50개 한도 초과는 상품과 성공한 관계·소장 상태를 유지하고 실패 관계만 수집한다", () => {
  const existingFolderNames = Array.from({ length: 49 }, (_, i) => `폴더${i}`);
  const result = plan(
    [
      product({ "버킷명": "첫폴더,다음폴더", "소장템 여부": "Y" }),
      product({ "버킷명": "다음폴더,첫폴더", "상품 링크": "https://krw.example/item/2" }),
    ],
    { ...OPTIONS, existingFolderNames },
  );
  assert.equal(result.newProductCount, 2);
  assert.equal(result.failedCount, 0);
  assert.deepEqual(result.foldersToCreate, ["첫폴더"]);
  assert.deepEqual(
    result.products.map((p) => p.folderNames),
    [["첫폴더"], ["첫폴더"]],
  );
  assert.equal(result.products[0].isOwned, true);
  assert.equal(result.folderFailures.length, 2);
  assert.deepEqual(
    result.folderFailures.map((f) => [f.rowNumber, f.sourceFolderName, f.reason]),
    [
      [2, "다음폴더", "FOLDER_LIMIT_EXCEEDED"],
      [3, "다음폴더", "FOLDER_LIMIT_EXCEEDED"],
    ],
  );
  const full = plan([product({ "소장템 여부": "Y" })], {
    ...OPTIONS,
    existingFolderNames: [...existingFolderNames, "마지막폴더"],
  });
  assert.deepEqual(full.products[0].folderNames, []);
  assert.equal(full.newProductCount, 1);
  assert.equal(full.products[0].isOwned, true);
  assertCounts(result);
  assertCounts(full);
});

test("동일 Import 재시도는 이전 매핑을 유지하고 남은 폴더 관계만 계획한다", () => {
  const rows = [product({ 버킷명: "abcdefg-first,abcdefg-second" })];
  const original = plan(rows, { ...OPTIONS, existingFolderNames: ["abcdefg"] });
  const replay = plan(rows, {
    ...OPTIONS,
    existingFolderNames: ["abcdefg", "abcdef2"],
    previousFolderMappings: original.folderMappings,
    existingProducts: [
      { id: "existing", url: rows[0]["상품 링크"], folderNames: ["abcdef2"], isOwned: false },
    ],
  });
  assert.equal(replay.newProductCount, 0);
  assert.deepEqual(replay.foldersToCreate, ["abcdef3"]);
  assert.deepEqual(replay.existingProductUpdates, [
    { productId: "existing", addFolderNames: ["abcdef3"], addOwnedFolder: false },
  ]);
  assert.deepEqual(replay.folderMappings, original.folderMappings);
});

test("원본 URL은 정규화·redirect 없이 그대로 저장하고 저장 계획에만 반영한다", () => {
  const url = "https://KRW.EXAMPLE:443/item/../product?b=2&a=1#detail";
  const result = plan([product({ "상품 링크": url })]);
  assert.equal(result.products[0].url, url);
  assert.equal(result.products[0].imageUrl, null);
  assert.equal("importedCount" in result, false);
});

test("상품 수 상한을 추가하지 않고 모든 행을 처리한다", () => {
  const rows = Array.from({ length: 1200 }, (_, index) =>
    product({ "상품 링크": `https://krw.example/item/${index}` }),
  );
  const result = plan(rows);
  assert.equal(result.totalCount, 1200);
  assert.equal(result.newProductCount, 1200);
  assertCounts(result);
});
