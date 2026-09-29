import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { cssInterop } from "nativewind";
import { useState } from "react";
import { Alert, Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconProfileCamera, IconProfileKakao, ImageProfilePlaceholder } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { HelperText, TextField } from "@/components/Field";

import { NICKNAME_HELPER_MESSAGE, validateNickname } from "./utils/validateNickname";

const Image = cssInterop(ExpoImage, { className: "style" });

export function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState("");
  const [profileImageUri, setProfileImageUri] = useState<string>();
  const [helperStatus, setHelperStatus] = useState<"default" | "error">("default");
  const [helperMessage, setHelperMessage] = useState(NICKNAME_HELPER_MESSAGE);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setProfileImageUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("사진 선택 실패", "사진을 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  };

  const handleSave = () => {
    Keyboard.dismiss();
    if (!nickname) {
      if (profileImageUri) router.back();
      return;
    }

    const errorMessage = validateNickname(nickname);
    if (errorMessage) {
      setHelperStatus("error");
      setHelperMessage(errorMessage);
      return;
    }

    router.back();
  };

  return (
    <View className="flex-1 bg-gray-50">
      <AppBar title="프로필 수정" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-margin pb-24 pt-[29px]"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <View className="relative h-[93px] w-[93px]">
            <Image
              source={profileImageUri ? { uri: profileImageUri } : ImageProfilePlaceholder}
              contentFit="cover"
              className="h-full w-full"
            />
            <Pressable
              accessibilityLabel="프로필 사진 변경"
              accessibilityRole="button"
              className="absolute left-[72px] top-[73px] h-6 w-6"
              hitSlop={12}
              onPress={handlePickImage}
            >
              <Image
                source={IconProfileCamera}
                contentFit="contain"
                className="absolute -left-5 -top-4 h-16 w-16"
              />
            </Pressable>
          </View>
        </View>

        <View className="mt-6">
          <TextField
            accessibilityLabel="닉네임"
            onChangeText={(value) => {
              setNickname(value);
              setHelperStatus("default");
              setHelperMessage(NICKNAME_HELPER_MESSAGE);
            }}
            onSubmitEditing={handleSave}
            placeholder="현재 닉네임"
            returnKeyType="done"
            value={nickname}
          />
          <HelperText className="mt-2.5 h-5" message={helperMessage} status={helperStatus} />
        </View>

        <View className="mt-5 h-12 flex-row items-center justify-between border-b border-gray-300">
          <Text className="text-gray-800 font-label-14">가입 수단</Text>
          <View className="flex-row items-center gap-1">
            <Image source={IconProfileKakao} contentFit="contain" className="h-[15px] w-[15px]" />
            <Text className="text-gray-600 font-b3">카카오 간편 인증</Text>
          </View>
        </View>
      </ScrollView>

      <View className="absolute left-6 right-6" style={{ bottom: insets.bottom + 10 }}>
        <Button size="large" onPress={handleSave}>
          저장
        </Button>
      </View>
    </View>
  );
}
