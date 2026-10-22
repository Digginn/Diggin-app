/* global __dirname */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const React = require("react");
const ts = require("typescript");

const LOGIN_SOURCES = {
  "@/lib/loginIntent": "src/lib/loginIntent.ts",
  "@/hooks/useLoginGate": "src/hooks/useLoginGate.tsx",
};

function load(file, mocks = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(path.join(__dirname, "..", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        mocks[name] ??
        (name.endsWith(".svg")
          ? name
          : LOGIN_SOURCES[name]
            ? load(LOGIN_SOURCES[name], mocks)
            : require(name)),
    },
  );
  return module.exports;
}

function nodes(node, type) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(!type || node.type === type ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap((child) => nodes(child, type)),
  ];
}

const domain = load("src/screens/diggle/domain/communitySave.ts");
const SNAPSHOT = {
  id: "2",
  name: "게시 시점 상품",
  brand: null,
  price: null,
  url: "https://shop.test/item",
  imageUrl: "https://shop.test/snapshot.jpg",
};

test("Snapshot 초안은 원본과 독립적이며 null 가격과 0원을 구분한다", () => {
  const draft = domain.snapshotSaveValues(SNAPSHOT);
  draft.name = "내 상품";
  assert.equal(SNAPSHOT.name, "게시 시점 상품");
  assert.equal(draft.price, "");
  assert.equal(draft.brand, "");
  assert.equal(domain.snapshotSaveValues({ ...SNAPSHOT, price: 0 }).price, "0");
});

test("상품명·브랜드는 NFC 정규화한 코드포인트로 검증하고 선택 가격의 범위를 확인한다", () => {
  const draft = domain.snapshotSaveValues(SNAPSHOT);
  const normalized = domain.normalizeSaveValues({
    ...draft,
    name: ` ${"가".repeat(100)} `,
    brand: " 나 ",
  });
  assert.equal(normalized.name, "가".repeat(100));
  assert.equal(normalized.brand, "나");
  assert.equal(domain.communitySaveErrors(normalized).name, undefined);
  assert.ok(domain.communitySaveErrors({ ...draft, name: "😀".repeat(101) }).name);
  assert.ok(domain.communitySaveErrors({ ...draft, brand: "a".repeat(31) }).brand);
  for (const price of ["", "0", "2147483647"])
    assert.equal(domain.communitySaveErrors({ ...draft, price }).price, undefined);
  for (const price of ["-1", "1.2", "abc", "2147483648"])
    assert.ok(domain.communitySaveErrors({ ...draft, price }).price);
});

function formHarness({ duplicate = false, fail = false, folderError = false } = {}) {
  const state = [],
    calls = [],
    invalidated = [],
    destinations = [],
    toasts = [];
  let cursor = 0,
    mutation,
    returned = 0;
  const folders = {
    data: [
      { id: "1", name: "소장템", isOwnedItems: true },
      { id: "2", name: "가방" },
    ],
    isPending: false,
    isError: folderError,
    refetch() {},
  };
  const products = load("src/api/products.ts", {
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return fail
            ? { error: new Error("offline") }
            : { data: [{ product_id: 50, is_duplicate: duplicate }] };
        },
      },
    },
  });
  const queryClient = {
    invalidateQueries: ({ queryKey }) => {
      invalidated.push(Array.from(queryKey));
      return Promise.resolve();
    },
    setQueryData: (_, update) => {
      folders.data = update(folders.data);
    },
  };
  const { CommunitySaveForm, SaveToAllScreen } = load("src/screens/diggle/SaveToAllScreen.tsx", {
    "react": {
      useEffect: () => {},
      useRef: (initial) => ({ current: initial }),
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [
          state[index],
          (next) => {
            state[index] = typeof next === "function" ? next(state[index]) : next;
          },
        ];
      },
    },
    "react-native": { View: "View", Text: "Text", ScrollView: "ScrollView" },
    "expo-image": { Image: "Image" },
    "nativewind": { cssInterop: (component) => component },
    "expo-router": {
      useRouter: () => ({
        replace: (destination) => destinations.push(destination),
        canGoBack: () => true,
        back() {},
      }),
      useLocalSearchParams: () => ({ postId: "10", itemId: "2" }),
    },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "@tanstack/react-query": {
      useQueryClient: () => queryClient,
      useMutation: (options) => {
        mutation ??= {
          isPending: false,
          isError: false,
          reset() {
            this.isError = false;
          },
        };
        mutation.mutateAsync = async (ids) => {
          mutation.isPending = true;
          try {
            const result = await options.mutationFn(ids);
            options.onSuccess(result);
            return result;
          } catch (error) {
            mutation.isError = true;
            throw error;
          } finally {
            mutation.isPending = false;
          }
        };
        return mutation;
      },
    },
    "@/api/products": products,
    "@/api/folders": {
      folderKeys: { all: ["folders"], list: () => ["folders", "list"] },
      FolderError: class extends Error {},
    },
    "@/components/app-bar": { AppBar: "AppBar" },
    "@/components/Button": { Button: "Button" },
    "@/components/Field": { TextField: "TextField", HelperText: "HelperText" },
    "@/components/Loading": { Spinner: "Spinner" },
    "@/components/modal": { ActionModal: "ActionModal", LoginRequiredModal: "LoginRequiredModal" },
    "@/components/WishLevelSelect": { WishLevelSelect: "WishLevelSelect" },
    "@/constants/messages": { TOAST_MESSAGES: { SAVE_011: "saved", SAVE_012: "failed" } },
    "@/contexts/AuthContext": { useAuth: () => ({ session: null, isRestoring: false }) },
    "@/hooks/useCreateFolder": {
      useCreateFolder: () => ({ mutateAsync: async (name) => ({ id: "3", name }) }),
    },
    "@/hooks/useFolders": { useFolders: () => folders },
    "@/hooks/useToast": { useToast: () => (message) => toasts.push(message) },
    "@/screens/item-detail/components/FolderManageSheet": {
      FolderManageSheet: "FolderManageSheet",
    },
    "./domain/communitySave": domain,
    "./queries/useCommunity": {
      useCommunityPost: () => {
        throw Error("guest must not query");
      },
    },
    "./utils/formatCommunityTime": { communityErrorMessage: () => "error" },
  });
  const render = (item = SNAPSHOT) => {
    cursor = 0;
    return CommunitySaveForm({ item, onBack: () => returned++ });
  };
  const field = (label) =>
    nodes(render(), "TextField").find((node) => node.props.accessibilityLabel === label).props;
  const sheet = () => nodes(render(), "FolderManageSheet")[0].props;
  const open = () =>
    nodes(render(), "Button")
      .find((node) => node.props.children === "폴더 선택하기")
      .props.onPress();
  return {
    render,
    field,
    sheet,
    open,
    calls,
    invalidated,
    destinations,
    toasts,
    folders,
    get returned() {
      return returned;
    },
    SaveToAllScreen,
  };
}

test("수정 가능한 초안에서 이미지·원본 링크는 고정하고 폴더 취소와 Snapshot 재조회에도 편집을 유지한다", () => {
  const h = formHarness();
  h.field("아이템명").onChangeText("내 상품");
  h.field("브랜드").onChangeText("내 브랜드");
  assert.equal(h.field("아이템 링크").editable, false);
  assert.equal(h.field("아이템 링크").onChangeText, undefined);
  assert.equal(nodes(h.render(), "Image")[0].props.source, SNAPSHOT.imageUrl);
  h.open();
  h.sheet().onBack();
  h.render({ ...SNAPSHOT, name: "새 조회 결과" });
  assert.equal(h.field("아이템명").value, "내 상품");
  assert.equal(h.field("브랜드").value, "내 브랜드");
  assert.equal(h.calls.length, 0);
});

test("폴더 무선택은 ALL에만 저장하고 성공 시 목록을 갱신해 커뮤니티로 돌아간다", async () => {
  const h = formHarness();
  h.open();
  await h.sheet().onComplete([]);
  assert.equal(h.calls[0].name, "save_product");
  assert.deepEqual(Array.from(h.calls[0].args.folder_ids), []);
  assert.equal("product_price" in h.calls[0].args, false);
  assert.equal(h.calls[0].args.product_image_url, SNAPSHOT.imageUrl);
  assert.equal(h.returned, 1);
  assert.deepEqual(h.invalidated, [["products"], ["folders"]]);
  assert.deepEqual(h.destinations, []);
});

test("선택 폴더와 0원·수정 정보를 전달하고 소장템 선택 시 위시레벨을 비운다", async () => {
  for (const owned of [false, true]) {
    const h = formHarness();
    h.field("아이템명").onChangeText(" 가방 ");
    h.field("가격").onChangeText("0");
    nodes(h.render(), "WishLevelSelect")[0].props.onSelect("high");
    h.open();
    await h.sheet().onComplete(owned ? ["1", "2"] : ["2"]);
    const args = h.calls[0].args;
    assert.equal(args.product_name, "가방");
    assert.equal(args.product_price, 0);
    assert.equal(args.product_wish_level, owned ? undefined : "high");
    assert.deepEqual(Array.from(args.folder_ids), owned ? [1, 2] : [2]);
  }
});

test("저장 실패 시 초안과 폴더 시트를 유지하고 성공 처리를 하지 않는다", async () => {
  const h = formHarness({ fail: true });
  h.field("아이템명").onChangeText("실패해도 유지");
  h.open();
  await assert.rejects(h.sheet().onComplete(["2"]), /offline/);
  assert.equal(h.sheet().errorMessage, "failed");
  assert.equal(h.field("아이템명").value, "실패해도 유지");
  assert.equal(h.returned, 0);
  assert.deepEqual(h.invalidated, []);
  assert.deepEqual(h.toasts, []);
});

test("중복은 새 저장 성공으로 알리지 않고 기존 상품 확인 동작만 제공한다", async () => {
  const h = formHarness({ duplicate: true });
  h.open();
  await h.sheet().onComplete(["2"]);
  assert.equal(h.returned, 0);
  assert.deepEqual(h.invalidated, []);
  assert.deepEqual(h.toasts, []);
  const modal = h.sheet().overlay;
  modal.props.primaryAction.onPress();
  assert.deepEqual(h.destinations, ["/items/50"]);
});

test("방금 만든 폴더는 목록에 반영하고 조회 실패 시 폴더 선택 진입을 막는다", async () => {
  const h = formHarness();
  h.open();
  assert.equal((await h.sheet().onCreateFolder("새 가방")).id, "3");
  assert.equal(h.sheet().folders[0].name, "새 가방");
  const failed = formHarness({ folderError: true });
  const button = nodes(failed.render(), "Button").find(
    (node) => node.props.children === "폴더 선택하기",
  );
  assert.equal(button.props.isDisabled, true);
});

test("비회원의 저장 화면 직접 진입은 조회 전에 로그인 안내로 차단한다", () => {
  const h = formHarness();
  assert.equal(h.SaveToAllScreen().type, "LoginRequiredModal");
});

function folderHarness() {
  const hooks = [];
  let cursor = 0;
  const { FolderManageSheet } = load("src/screens/item-detail/components/FolderManageSheet.tsx", {
    "react": {
      useRef: (initial) => {
        const index = cursor++;
        return (hooks[index] ??= { current: initial });
      },
      useState: (initial) => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [
          hooks[index],
          (next) => {
            hooks[index] = typeof next === "function" ? next(hooks[index]) : next;
          },
        ];
      },
    },
    "react-native": {
      View: "View",
      Text: "Text",
      ScrollView: "ScrollView",
      Pressable: "Pressable",
    },
    "@/components/BottomSheet": { BottomSheet: "BottomSheet" },
    "@/components/Button": { Button: "Button" },
    "@/components/modal": { ActionModal: "ActionModal" },
    "@/screens/folder/components/FolderNameModal": { FolderNameModal: "FolderNameModal" },
    "@/screens/folder/components/FolderToast": { FolderToast: "FolderToast" },
    "@/screens/folder/constants/folderMessages": {
      FOLDER_MESSAGES: { createError: "create failed" },
    },
  });
  return (props = {}) => {
    cursor = 0;
    return FolderManageSheet({
      isNewItem: true,
      folders: [{ id: "1", name: "소장템", isOwnedItems: true }],
      selectedFolderIds: [],
      onClose() {},
      onComplete() {},
      ...props,
    });
  };
}

test("새 상품의 소장템 선택에는 기존 폴더 삭제 안내가 없고 9개부터 높이를 고정한다", () => {
  const render = folderHarness();
  nodes(render(), "Pressable")
    .find((row) => row.props.accessibilityLabel === "소장템")
    .props.onPress();
  assert.equal(render().props.overlay.props.visible, false);
  assert.equal(
    nodes(render(), "Pressable").find((row) => row.props.accessibilityLabel === "소장템").props
      .accessibilityState.checked,
    true,
  );
  assert.equal(render().props.height, undefined);
  assert.equal(
    render({ folders: Array.from({ length: 9 }, (_, id) => ({ id: String(id), name: "폴더" })) })
      .props.height,
    702,
  );
});

test("폴더 생성 실패 안내와 기존 선택을 유지하고 재시도 성공한 폴더를 자동 선택한다", async () => {
  const render = folderHarness();
  nodes(render(), "Pressable")
    .find((row) => row.props.accessibilityLabel === "소장템")
    .props.onPress();
  nodes(render(), "Pressable")
    .find((row) => row.props.accessibilityLabel === "새 폴더 만들기")
    .props.onPress();
  let modal = render({
    onCreateFolder: async () => {
      throw Error("limit");
    },
    getCreateErrorMessage: () => "50개 제한",
  }).props.overlay;
  assert.equal(await modal.props.onSubmit("보존할 이름"), false);
  assert.equal(
    nodes(render().props.overlay.props.overlay, "FolderToast")[0].props.message,
    "50개 제한",
  );
  modal = render({ onCreateFolder: async () => ({ id: "2", name: "보존할 이름" }) }).props.overlay;
  assert.equal(await modal.props.onSubmit("보존할 이름"), true);
  modal.props.onClose();
  let selected;
  await nodes(
    render({
      onComplete: (ids) => {
        selected = ids;
      },
    }),
    "Button",
  )[0].props.onPress();
  assert.deepEqual(Array.from(selected), ["1", "2"]);
});

test("저장 중 연타·닫기를 막고 실패해도 폴더 선택을 유지해 재시도한다", async () => {
  const render = folderHarness();
  let calls = 0,
    closed = 0,
    reject;
  const props = {
    onComplete: () => {
      calls++;
      return new Promise((_, fail) => {
        reject = fail;
      });
    },
    onClose: () => closed++,
  };
  nodes(render(props), "Pressable")
    .find((row) => row.props.accessibilityLabel === "소장템")
    .props.onPress();
  const finish = () => nodes(render(props), "Button")[0].props.onPress();
  const pending = finish();
  await finish();
  render(props).props.onRequestClose();
  assert.equal(calls, 1);
  assert.equal(closed, 0);
  reject(Error("offline"));
  await pending;
  assert.equal(
    nodes(render(props), "Pressable").find((row) => row.props.accessibilityLabel === "소장템").props
      .accessibilityState.checked,
    true,
  );
  const retry = finish();
  assert.equal(calls, 2);
  reject(Error("offline"));
  await retry;
});
