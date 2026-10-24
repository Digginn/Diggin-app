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

import { AVATAR_UNREADABLE_ERROR } from "@/api/avatar";
import { IconProfileCamera, ImageProfilePlaceholder } from "@/assets/images/my";
import { AppBar } from "@/components/app-bar";
import { AuthProviderIcon, type AuthProvider } from "@/components/AuthProviderIcon";
import { Button } from "@/components/Button";
import { HelperText, TextField } from "@/components/Field";
import { useToast } from "@/hooks/useToast";
import { textLength } from "@/utils/text";

import { PROFILE_MESSAGES } from "./constants/profileMessages";
import { MAX_NICKNAME_LENGTH, validateNickname } from "./utils/validateNickname";
import { validateProfileImage } from "./utils/validateProfileImage";

const Image = cssInterop(ExpoImage, { className: "style" });

type ProfileEditScreenProps = {
  authProvider?: AuthProvider;
  currentNickname?: string;
  avatarUrl?: string;
  /** 서버 검사에 걸리면 입력칸 아래에 보여줄 문구를 돌려준다. */
  onSaveNickname?: (nickname: string) => Promise<string | void>;
  onSavePhoto?: (uri: string) => Promise<void>;
};

const AUTH_PROVIDER_LABELS = { kakao: "카카오", google: "Google", apple: "Apple" } as const;

export function ProfileEditScreen({
  authProvider = "kakao",
  currentNickname,
  avatarUrl,
  onSaveNickname,
  onSavePhoto,
}: ProfileEditScreenProps = {}) {
  const router = useRouter();
  const showToast = useToast();
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState("");
  const [profileImageUri, setProfileImageUri] = useState<string>();
  const [helperStatus, setHelperStatus] = useState<"default" | "error">("default");
  // MY-002 오류 문구가 보이는 동안 저장을 막고, 닉네임을 고치면 다시 연다.
  const isNicknameError = helperStatus === "error";
  const [helperMessage, setHelperMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // MY-02 1자는 문구 없이 테두리·카운터만 빨갛게 하고 저장을 막는다.
  const isNicknameTooShort = textLength(nickname) === 1;
  const isSaveDisabled =
    isSaving || isNicknameError || isNicknameTooShort || (!nickname && !profileImageUri);

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

      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      // MY-003 쓸 수 없는 사진이면 기존 사진을 그대로 둔다.
      const imageError = validateProfileImage(asset);
      if (imageError) {
        showToast(imageError);
        return;
      }
      setProfileImageUri(asset.uri);
    } catch {
      showToast(PROFILE_MESSAGES.photoUnreadable);
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
    if (isSaveDisabled) return;

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
    // 닉네임은 서버 검사에 걸릴 수 있어 사진보다 먼저 저장한다.
    let failureMessage: string = PROFILE_MESSAGES.nicknameFailure;
    try {
      if (nickname) {
        const nicknameError = await onSaveNickname?.(nickname);
        if (nicknameError) {
          setHelperStatus("error");
          setHelperMessage(nicknameError);
          return;
        }
      }
      failureMessage = PROFILE_MESSAGES.photoFailure;
      if (profileImageUri) await onSavePhoto?.(profileImageUri);
      router.dismissTo("/(tabs)/my" as Href);
      showToast(nickname ? PROFILE_MESSAGES.nicknameSuccess : PROFILE_MESSAGES.photoSuccess);
    } catch (error) {
      const isUnreadable =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        error.message === AVATAR_UNREADABLE_ERROR;
      showToast(isUnreadable ? PROFILE_MESSAGES.photoUnreadable : failureMessage);
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
              source={
                profileImageUri || avatarUrl
                  ? { uri: profileImageUri ?? avatarUrl }
                  : ImageProfilePlaceholder
              }
              contentFit="cover"
              className="h-full w-full"
              onError={() => {
                if (!profileImageUri) return;
                setProfileImageUri(undefined);
                showToast(PROFILE_MESSAGES.photoUnreadable);
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
          <View className="justify-center">
            <TextField
              accessibilityLabel="닉네임"
              inputClassName="pr-12"
              isError={isNicknameError || isNicknameTooShort}
              maxLength={MAX_NICKNAME_LENGTH}
              onChangeText={(value) => {
                setNickname(value);
                setHelperStatus("default");
                setHelperMessage("");
              }}
              onSubmitEditing={handleSave}
              placeholder={currentNickname ?? "현재 닉네임"}
              returnKeyType="done"
              value={nickname}
            />
            {/* AUTH-08 입력칸 오른쪽 글자 수 */}
            <Text
              pointerEvents="none"
              className={`absolute right-4 font-note ${isNicknameTooShort ? "text-semantic-error" : "text-gray-600"}`}
            >
              {textLength(nickname)}/{MAX_NICKNAME_LENGTH}
            </Text>
          </View>
          <HelperText className="mt-2.5 h-5" message={helperMessage} status={helperStatus} />
        </View>

        <View className="mt-5 h-12 flex-row items-center justify-between border-b border-gray-300">
          <Text className="text-gray-800 font-label-14">가입 수단</Text>
          <View className="flex-row items-center gap-1">
            <AuthProviderIcon provider={authProvider} />
            <Text className="text-gray-600 font-b3">
              {AUTH_PROVIDER_LABELS[authProvider]} 간편 인증
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="absolute left-6 right-6" style={{ bottom: insets.bottom + 10 }}>
        <Button size="large" isDisabled={isSaveDisabled} onPress={handleSave}>
          저장하기
        </Button>
      </View>
    </View>
  );
}
