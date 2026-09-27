import { useState } from "react";
import { View } from "react-native";

import { IconReport } from "@/assets/images/appbar";
import { AppBar } from "@/components/AppBar";
import { TopTab } from "@/components/TopTab";

const TABS = [
  { key: "all", label: "전체 게시글" },
  { key: "vote", label: "투표" },
];

export default function Index() {
  const [activeTab, setActiveTab] = useState("all");

  return (
    <View className="flex-1 bg-gray-0">
      <AppBar
        left="back"
        title="현재 페이지 명"
        right={
          <AppBar.IconButton
            icon={IconReport}
            accessibilityLabel="신고"
            className="text-gray-400"
            onPress={() => {}}
          />
        }
      />
      <TopTab items={TABS} activeKey={activeTab} onChange={setActiveTab} />
    </View>
  );
}
