export type SupportEmailInfo = {
  nickname: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  os: "ios" | "android";
  osName: string | null;
  osVersion: string | null;
  apiLevel: number | null;
  model: string | null;
  manufacturer: string | null;
  deviceId: string | null;
};

const GUIDE = [
  "문의, 피드백, 버그, 제안을 남겨 주세요.",
  "가능한 빠르게 답변 드리겠습니다.",
  "*자세히 적어 주시면(사진, 영상 첨부 포함) 더욱 빠르게 해결됩니다.",
].join("\n");

/** 1:1 문의 메일 양식. 안내 문구 아래 빈 줄 두 개를 두고 기기 정보를 한 줄씩 붙인다. */
export function buildSupportEmail(info: SupportEmailInfo) {
  const name = info.nickname ?? "비회원";
  const model = [info.model, info.manufacturer && `(${info.manufacturer})`]
    .filter(Boolean)
    .join(" ");
  const lines = [
    `Name: ${name}`,
    `App Version: ${info.appVersion ?? "-"}`,
    `Build Number: ${info.buildNumber ?? "-"}`,
    // ApiLevel은 Android에만 있다.
    ...(info.os === "android" ? [`ApiLevel: ${info.apiLevel ?? "-"}`] : []),
    `SystemVersion: ${[info.osName, info.osVersion].filter(Boolean).join(" ") || "-"}`,
    `Model: ${model || "-"}`,
    `Identification: ${info.deviceId ?? "-"}`,
  ];
  return {
    subject: `[DIGGIN] ${name}님의 메일입니다.`,
    body: `${GUIDE}\n\n\n${lines.join("\n")}`,
  };
}
