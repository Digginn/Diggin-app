// #157 출시용 부분 문자열 정책. 정상 상품 오탐을 허용하며, DB 검사와 같은 목록을 유지한다.
export const RESTRICTED_PRODUCT_KEYWORDS = [
  "성인",
  "19금",
  "19세",
  "19+",
  "18+",
  "성인인증",
  "청소년유해",
  "청소년 구매불가",
  "미성년자 구매불가",
  "주류",
  "소주",
  "맥주",
  "와인",
  "위스키",
  "보드카",
  "막걸리",
  "사케",
  "리큐르",
  "칵테일",
  "담배",
  "전자담배",
  "니코틴",
  "궐련",
  "시가",
  "vape",
  "cigarette",
  "성인용품",
  "섹스토이",
  "섹스 토이",
  "딜도",
  "바이브레이터",
  "자위기구",
  "애널플러그",
  "성인영상",
  "성인만화",
  "성인잡지",
  "adult",
  "sex toy",
] as const;

export const RESTRICTED_PRODUCT_MESSAGE = "이용정책에 따라 저장할 수 없는 상품입니다.";

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

const keywords = RESTRICTED_PRODUCT_KEYWORDS.map(normalize);

export function isRestrictedProduct(name: string, labels: readonly string[] = []) {
  return [name, ...labels].some((value) => {
    const text = normalize(value);
    return keywords.some((keyword) => text.includes(keyword));
  });
}

/** 원문 전체를 검사한 뒤 제한 표시는 짧은 키워드로 보존하고, 일반 표시는 저장 상한을 적용한다. */
export function normalizeRestrictionLabels(labels: readonly string[]) {
  for (const label of labels) {
    const text = normalize(label);
    const keyword = RESTRICTED_PRODUCT_KEYWORDS.find((value) => text.includes(normalize(value)));
    if (keyword) return [keyword];
  }
  return labels
    .map((label) => label.normalize("NFC").trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((label) => Array.from(label).slice(0, 100).join(""));
}
