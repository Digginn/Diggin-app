import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter, type Href } from "expo-router";
import { cssInterop } from "nativewind";
import { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconProfileCamera, IconProfileKakao, ImageProfilePlaceholder } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { HelperText, TextField } from "@/components/Field";
import { useToast } from "@/hooks/useToast";

import { PROFILE_MESSAGES } from "./constants/profileMessages";
import { NICKNAME_HELPER_MESSAGE, validateNickname } from "./utils/validateNickname";

const Image = cssInterop(ExpoImage, { className: "style" });

type ProfileEditScreenProps = {
  onSaveNickname?: (nickname: string) => Promise<void>;
  onSavePhoto?: (uri: string) => Promise<void>;
};

export function ProfileEditScreen({ onSaveNickname, onSavePhoto }: ProfileEditScreenProps = {}) {
  const router = useRouter();
  const showToast = useToast();
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState("");
  const [profileImageUri, setProfileImageUri] = useState<string>();
  const [helperStatus, setHelperStatus] = useState<"default" | "error">("default");
  const [helperMessage, setHelperMessage] = useState(NICKNAME_HELPER_MESSAGE);
  const [isSaving, setIsSaving] = useState(false);

  const handlePickImage = async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("카메라 권한 필요", "사진을 찍으려면 설정에서 카메라 접근을 허용해 주세요.");
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets[0]) {
        setProfileImageUri(result.assets[0].uri);
      }
    } catch {
      showToast(PROFILE_MESSAGES.photoFailure);
    }
  };

  const handlePhotoMenu = () => {
    Keyboard.dismiss();
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["사진찍기", "앨범에서 선택", "취소"], cancelButtonIndex: 2 },
        (index) => {
          if (index === 0) return handlePickImage("camera");
          if (index === 1) return handlePickImage("library");
        },
      );
      return;
    }
    Alert.alert(
      "프로필 사진 변경",
      undefined,
      [
        { text: "취소", style: "cancel" },
        { text: "사진찍기", onPress: () => handlePickImage("camera") },
        { text: "앨범에서 선택", onPress: () => handlePickImage("library") },
      ],
      { cancelable: true },
    );
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (isSaving || (!nickname && !profileImageUri)) return;

    const errorMessage = validateNickname(nickname);
    if (errorMessage) {
      setHelperStatus("error");
      setHelperMessage(errorMessage);
      return;
    }

    if ((nickname && !onSaveNickname) || (profileImageUri && !onSavePhoto)) {
      showToast("저장 기능은 준비 중입니다.");
      return;
    }

    setIsSaving(true);
    let failureMessage: string = PROFILE_MESSAGES.photoFailure;
    try {
      if (profileImageUri) await onSavePhoto?.(profileImageUri);
      failureMessage = PROFILE_MESSAGES.nicknameFailure;
      if (nickname) await onSaveNickname?.(nickname);
      router.dismissTo("/(tabs)/my" as Href);
      showToast(nickname ? PROFILE_MESSAGES.nicknameSuccess : PROFILE_MESSAGES.photoSuccess);
    } catch {
      showToast(failureMessage);
    } finally {
      setIsSaving(false);
    }
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
          <Pressable
            accessibilityLabel="프로필 사진 변경"
            accessibilityRole="button"
            className="relative h-[93px] w-[93px]"
            hitSlop={12}
            onPress={handlePhotoMenu}
          >
            <Image
              source={profileImageUri ? { uri: profileImageUri } : ImageProfilePlaceholder}
              contentFit="cover"
              className="h-full w-full"
              onError={() => {
                if (!profileImageUri) return;
                setProfileImageUri(undefined);
                showToast(PROFILE_MESSAGES.photoFailure);
              }}
            />
            <View pointerEvents="none" className="absolute left-[72px] top-[73px] h-6 w-6">
              <View pointerEvents="none" className="absolute -left-5 -top-4">
                <IconProfileCamera />
              </View>
            </View>
          </Pressable>
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
        <Button size="large" isDisabled={isSaving} onPress={handleSave}>
          저장
        </Button>
      </View>
    </View>
  );
}
