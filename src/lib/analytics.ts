import * as amplitude from "@amplitude/analytics-react-native";

const API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;

// 키가 없는 빌드는 수집하지 않는다.
if (API_KEY)
  amplitude.init(API_KEY, undefined, {
    // 일부만 넘기면 나머지가 꺼져 SDK 기본값을 모두 적는다. 광고 식별자는 수집하지 않는다(MY-010).
    trackingOptions: {
      adid: false,
      carrier: true,
      deviceManufacturer: true,
      deviceModel: true,
      ipAddress: true,
      language: true,
      osName: true,
      osVersion: true,
      platform: true,
      appSetId: true,
      idfv: true,
      country: false,
    },
  });

/** 로그인한 회원과 이벤트를 연결한다. 로그아웃하면 다음 계정과 섞이지 않게 기기 식별값도 새로 만든다. */
export function setAnalyticsUser(userId: string | null) {
  if (!API_KEY) return;
  if (userId) amplitude.setUserId(userId);
  else amplitude.reset();
}
