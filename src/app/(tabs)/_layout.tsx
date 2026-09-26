import { Tabs } from "expo-router";

import { NavigationBar } from "@/components/NavigationBar";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <NavigationBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="folder" />
      <Tabs.Screen name="diggle" />
      <Tabs.Screen name="my" />
    </Tabs>
  );
}
