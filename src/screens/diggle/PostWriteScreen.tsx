import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useFocusEffect, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/Button";
import { HelperText } from "@/components/Field";
import { Spinner } from "@/components/Loading";
import { LoadingDialog } from "@/components/LoadingDialog";
import { ActionModal, LoginRequiredModal } from "@/components/modal";
import { DIGGLE_TOAST_MESSAGES } from "@/constants/messages";
import { useAuth } from "@/contexts/AuthContext";
import { usePostDraft } from "@/contexts/PostDraftContext";
import { useToast } from "@/hooks/useToast";

import { communityKeys } from "./api/community";
import {
  agreeCommunityPolicy,
  communityWriteError,
  createCommunityPost,
  fetchCommunityPolicy,
} from "./api/communityWrite";
import { CommunityBodyField } from "./components/CommunityBodyField";
import { CommunityPolicySheet } from "./components/CommunityPolicySheet";
import { MAX_ATTACH_COUNT, ProductAttachGrid } from "./components/ProductAttachGrid";
import { postBodyLength } from "./domain/postBody";

export function PostWriteScreen({ type = "all" }: { type?: "all" | "vote" }) {
  const { session, isRestoring } = useAuth();
  const router = useRouter();
  if (isRestoring)
    return (
      <View className="flex-1 items-center justify-center bg-gray-0">
        <Spinner />
      </View>
    );
  if (!session)
    return (
      <LoginRequiredModal
        visible
        onClose={() => router.dismissTo("/(tabs)/diggle")}
        onLogin={() => router.replace("/login")}
      />
    );
  return <WriteEditor key={session.user.id} viewer={session.user.id} isVote={type === "vote"} />;
}

function WriteEditor({ viewer, isVote }: { viewer: string; isVote: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const showToast = useToast();
  const { items, setItems, reset } = usePostDraft();
  const [body, setBody] = useState("");
  const [isExitOpen, setExitOpen] = useState(false);
  const [isLeaving, setLeaving] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isAgreeing, setAgreeing] = useState(false);
  const [isPolicyOpen, setPolicyOpen] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(true);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const policyKey = [...communityKeys.all, viewer, "policy"];
  const policy = useQuery({ queryKey: policyKey, queryFn: fetchCommunityPolicy, enabled: !isVote });
  const isPolicyRequired = !isVote && policy.data !== true;
  const canEdit = isVote || policy.data === true;
  const maxAttachCount = isVote ? 1 : MAX_ATTACH_COUNT;
  const count = postBodyLength(body);
  const canSubmit =
    canEdit && count >= 5 && count <= 50 && items.length > 0 && items.length <= maxAttachCount;
  const hasDraft = body.length > 0 || items.length > 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reset();
    };
  }, [reset]);

  // 상품 선택 화면은 push이므로 유지한다. 작성 화면 자체를 떠날 때만 초안을 폐기한다.
  usePreventRemove(!isLeaving && (hasDraft || isSubmitting || isAgreeing), () => {
    if (!busy.current) setExitOpen(true);
  });
  const leave = useCallback(() => {
    if (busy.current) return;
    if (hasDraft) setExitOpen(true);
    else setLeaving(true);
  }, [hasDraft]);
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        leave();
        return true;
      });
      return () => subscription.remove();
    }, [leave]),
  );
  useEffect(() => {
    if (isLeaving)
      router.dismissTo({ pathname: "/(tabs)/diggle", params: { tab: isVote ? "vote" : "all" } });
  }, [isLeaving, isVote, router]);

  async function agree() {
    if (busy.current) return;
    busy.current = true;
    setAgreeing(true);
    setPolicyError("");
    try {
      await agreeCommunityPolicy();
      if (mounted.current) queryClient.setQueryData(policyKey, true);
    } catch (error) {
      if (mounted.current) setPolicyError(communityWriteError(error));
    } finally {
      busy.current = false;
      if (mounted.current) setAgreeing(false);
    }
  }

  async function submit() {
    if (!canSubmit || busy.current) return;
    Keyboard.dismiss();
    const input = {
      type: isVote ? ("vote" as const) : ("post" as const),
      body,
      productIds: items.map((item) => item.id),
    };
    const signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, id: randomUUID() };
    busy.current = true;
    setSubmitting(true);
    try {
      await createCommunityPost({ ...input, requestId: request.current.id });
      if (!mounted.current) return;
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
      reset();
      setLeaving(true);
      showToast(isVote ? DIGGLE_TOAST_MESSAGES.VOTE_009 : "게시글을 등록했습니다.");
    } catch (error) {
      if (mounted.current) showToast(communityWriteError(error));
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-gray-0"
    >
      <AppBar
        title={isVote ? "투표글 작성" : "게시글 작성"}
        onBack={leave}
        isDisabled={isSubmitting || isAgreeing}
        right={
          <AppBar.TextButton disabled={!canSubmit || isSubmitting} onPress={() => void submit()}>
            등록
          </AppBar.TextButton>
        }
      />
      {canEdit ? (
        <ScrollView
          className="px-margin"
          contentContainerStyle={{ gap: 24, paddingTop: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <CommunityBodyField isVote={isVote} value={body} onChangeText={setBody} />
          {body.length > 0 && count < 5 && (
            <HelperText
              status="error"
              message="공백을 제외하고 5자 이상 입력해 주세요. (이모지 포함)"
            />
          )}
          <View className="gap-3">
            <View className="flex-row justify-between">
              <Text className="text-gray-900 font-label-14">아이템 첨부</Text>
              <Text className="text-gray-500 font-meta">
                {items.length}/{maxAttachCount}
              </Text>
            </View>
            <ProductAttachGrid
              items={items}
              maxCount={maxAttachCount}
              onPressAdd={() =>
                router.push(isVote ? "/posts/item-select?type=vote" : "/posts/item-select")
              }
              onRemove={(item) => setItems(items.filter((selected) => selected.id !== item.id))}
            />
            <HelperText message="위시 아이템만 첨부할 수 있습니다." />
            {isVote && (
              <HelperText message="BUY / NOT 투표는 등록 후 24시간 뒤 자동으로 종료됩니다." />
            )}
          </View>
          <View className="gap-2 rounded bg-gray-100 p-4">
            <Text className="text-gray-600 font-note">
              게시글을 등록하면 DIGGIN 커뮤니티 이용정책에 동의한 것으로 간주됩니다.
            </Text>
            <AppBar.TextButton onPress={() => setPolicyOpen(true)}>보기</AppBar.TextButton>
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center gap-4 px-margin">
          {policy.isPending ? (
            <Spinner />
          ) : policy.isError ? (
            <>
              <Text className="text-gray-600 font-b3">
                이용정책 동의 여부를 확인하지 못했습니다.
              </Text>
              <Button onPress={() => void policy.refetch()}>다시 시도</Button>
            </>
          ) : null}
        </View>
      )}
      <CommunityPolicySheet
        visible={(isPolicyRequired && policy.data === false) || isPolicyOpen}
        isRequired={isPolicyRequired}
        isBusy={isAgreeing}
        error={policyError}
        onErrorDismiss={() => setPolicyError("")}
        onConfirm={() => {
          if (isPolicyRequired) void agree();
          else setPolicyOpen(false);
        }}
        onClose={() => {
          if (busy.current) return;
          if (isPolicyRequired) setLeaving(true);
          else setPolicyOpen(false);
        }}
      />
      {isSubmitting && (
        <LoadingDialog
          message={isVote ? "투표를 등록하는 중입니다." : "게시글을 등록하는 중입니다."}
        />
      )}
      <ActionModal
        visible={isExitOpen}
        type="2Btn"
        title="작성을 그만두시겠습니까?"
        description="작성 중인 내용은 저장되지 않습니다."
        secondaryAction={{ label: "계속 작성", onPress: () => setExitOpen(false) }}
        primaryAction={{
          label: "나가기",
          onPress: () => {
            setExitOpen(false);
            reset();
            setLeaving(true);
          },
        }}
        onRequestClose={() => setExitOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
