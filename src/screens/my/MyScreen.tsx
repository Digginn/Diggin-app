import { useRouter, type Href } from "expo-router";
import type { FC } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { SvgProps } from "react-native-svg";

import {
  IconMyActivity,
  IconMyChevron,
  IconMyProfile,
  IconMySettings,
  IconMySupport,
} from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";

type MyMenuRow = {
  label: string;
  value?: string;
  hasChevron?: boolean;
  hasDivider?: boolean;
  onPress?: () => void;
};

type MySectionProps = {
  title: string;
  Icon: FC<SvgProps>;
  rows: MyMenuRow[];
};

const SUPPORT_ROWS: MyMenuRow[] = [
  { label: "1:1 문의" },
  { label: "이용약관" },
  { label: "앱 정보", value: "버전명", hasChevron: false, hasDivider: false },
];

const SETTINGS_ROWS: MyMenuRow[] = [
  { label: "알림 설정" },
  { label: "로그아웃" },
  { label: "회원 탈퇴" },
];

function MySection({ title, Icon, rows }: MySectionProps) {
  return (
    <View className="w-full">
      <View className="gap-2.5">
        <View className="flex-row items-start gap-2">
          <View className="h-6 w-6 items-center justify-center">
            <Icon width={24} height={24} />
          </View>
          <Text className="text-gray-900 font-label-16-semibold">{title}</Text>
        </View>
        <View className="h-0.5 w-full bg-gray-900" />
      </View>

      <View className="px-2">
        {rows.map((row) => {
          const hasDivider = row.hasDivider ?? true;

          return (
            <Pressable
              key={row.label}
              accessibilityRole={row.onPress ? "button" : undefined}
              disabled={!row.onPress}
              onPress={row.onPress}
              className={`h-12 flex-row items-center justify-between ${hasDivider ? "border-b border-gray-300" : ""}`}
            >
              <Text numberOfLines={1} className="flex-1 text-gray-800 font-b3">
                {row.label}
              </Text>
              {row.value ? (
                <Text className="text-gray-800 font-meta">{row.value}</Text>
              ) : row.hasChevron !== false ? (
                <View className="h-6 w-6 items-center justify-center">
                  <View style={{ transform: [{ scaleX: -1 }] }}>
                    <IconMyChevron width={18} height={18} />
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MyScreen() {
  const router = useRouter();
  const activityRows: MyMenuRow[] = [
    { label: "내가 쓴 글", onPress: () => router.push("/my-posts" as Href) },
    { label: "내가 투표한 글", onPress: () => router.push("/my-voted-posts" as Href) },
    { label: "CSV 파일로 관심 상품 불러오기" },
  ];

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar left="none" title="MY" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-margin pb-6 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <MySection
          title="프로필"
          Icon={IconMyProfile}
          rows={[{ label: "프로필 수정", onPress: () => router.push("/profile-edit" as Href) }]}
        />
        <MySection title="활동" Icon={IconMyActivity} rows={activityRows} />
        <MySection title="고객지원" Icon={IconMySupport} rows={SUPPORT_ROWS} />
        <MySection title="설정" Icon={IconMySettings} rows={SETTINGS_ROWS} />
      </ScrollView>
    </View>
  );
}
