import { useState } from "react";
import { createRoot } from "react-dom/client";

import { LoginScreen, type LoginResult } from "../src/screens/auth/LoginScreen";
import { LogoutDialog } from "../src/screens/auth/LogoutDialog";

// 이 모듈은 브라우저 테스트에서만 직접 불러오며 앱 빌드 진입점에서는 참조하지 않는다.
export function mountDeferredForm(kind: "login" | "logout") {
  document.getElementById("root")!.hidden = true;
  const host = document.createElement("div");
  document.body.append(host);
  let requests = 0;
  let resolve: ((result: LoginResult) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  function pendingRequest() {
    requests += 1;
    return new Promise<LoginResult>((success, failure) => {
      resolve = success;
      reject = failure;
    });
  }
  function DialogHarness() {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <LogoutDialog
        isOpen={isOpen}
        onCancel={() => setIsOpen(false)}
        onLogout={async () => {
          await pendingRequest();
          setIsOpen(false);
        }}
      />
    );
  }
  createRoot(host).render(
    kind === "login" ? (
      <LoginScreen
        initialEmail="preview@example.com"
        initialPassword="preview123"
        onLogin={pendingRequest}
      />
    ) : (
      <DialogHarness />
    ),
  );
  return {
    get requests() {
      return requests;
    },
    succeed() {
      resolve?.({});
    },
    fail() {
      reject?.(new Error("Simulated network failure"));
    },
  };
}
