import { Text, View } from "react-native";

export function NoticeHeader({
  title,
  body,
  createdAt,
}: {
  title: string;
  body: string;
  createdAt: string;
}) {
  return (
    <>
      <View className="gap-2 border-b border-gray-200 px-margin pb-5 pt-6">
        <View className="h-5 justify-center self-start overflow-hidden rounded-sm bg-gray-300 px-1.5">
          <Text className="text-gray-800 font-label-14">공지</Text>
        </View>
        <Text className="text-gray-900 font-h2">{title}</Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-gray-800 font-label-14">Diggin</Text>
          <View className="h-5 justify-center rounded-sm bg-gray-800 px-1.5">
            <Text className="text-gray-0 font-label-12-semibold">운영자</Text>
          </View>
          <Text className="text-gray-500 font-meta">
            {new Intl.DateTimeFormat("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
              .format(new Date(createdAt))
              .replace(/\s|\.$/g, "")}
          </Text>
        </View>
      </View>
      <Text className="px-margin py-6 text-gray-700 font-b2">{body}</Text>
    </>
  );
}
