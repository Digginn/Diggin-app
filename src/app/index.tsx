import { Image } from "expo-image";
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white">
      <Image
        source={require("@/assets/images/icon-black.png")}
        style={{ width: 96, height: 96, borderRadius: 22 }}
      />
      <Text className="text-xl font-bold">Diggin</Text>
    </View>
  );
}
