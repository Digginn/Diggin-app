import { useId, useRef, useState, type SubmitEvent } from "react";

import { AdminBrand } from "../../components/AdminBrand";
import { AdminBtn } from "../../components/AdminBtn";
import { AdminIcon } from "../../components/AdminIcon";

export type LoginCredentials = { email: string; password: string };
export type LoginResult = { error: string } | { error?: never };
export const INVALID_CREDENTIALS_MESSAGE = "이메일 또는 비밀번호가 일치하지 않습니다.";

export function LoginScreen({
  onLogin,
  hasLoginNotice = false,
  initialEmail = "",
  initialPassword = "",
  initialError = "",
}: {
  onLogin: (credentials: LoginCredentials) => Promise<LoginResult>;
  hasLoginNotice?: boolean;
  initialEmail?: string;
  initialPassword?: string;
  initialError?: string;
}) {
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const submitLock = useRef(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(initialError);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitLock.current) return;
    submitLock.current = true;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await onLogin({ email: email.trim(), password });
      if (result.error) setError(result.error);
    } catch {
      setError("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <form
        className="login-card"
        onSubmit={handleSubmit}
        aria-label="관리자 로그인"
        aria-busy={isSubmitting}
      >
        <header className="login-card__head">
          <AdminBrand />
          <h1>관리자 로그인</h1>
          <p>운영 계정으로 로그인해야 신고·제재 내역을 확인할 수 있습니다.</p>
        </header>
        {hasLoginNotice && (
          <div className="login-notice" role="status">
            <AdminIcon name="info" size={18} />
            <p>로그인이 필요합니다. 로그인 후 다시 시도해 주세요.</p>
          </div>
        )}
        <div className="login-fields">
          <div className="login-field">
            <label htmlFor={emailId}>이메일</label>
            <div className="login-input">
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="username"
                required
                spellCheck={false}
                autoCapitalize="none"
                placeholder="운영 계정 이메일"
                value={email}
                disabled={isSubmitting}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
              />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor={passwordId}>비밀번호</label>
            <div className={`login-input ${error ? "login-input--error" : ""}`}>
              <input
                id={passwordId}
                name="password"
                type={isPasswordVisible ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="비밀번호"
                value={password}
                disabled={isSubmitting}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={isPasswordVisible ? "비밀번호 숨기기" : "비밀번호 표시"}
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((value) => !value)}
              >
                <AdminIcon name={isPasswordVisible ? "eye" : "eye-off"} size={18} />
              </button>
            </div>
            {error && (
              <p className="login-error" id={errorId} role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <AdminBtn type="submit" className="login-submit" disabled={!canSubmit}>
          {isSubmitting ? "로그인 중…" : "로그인"}
        </AdminBtn>
        <p className="login-help">계정 발급·비밀번호 재설정은 서비스 관리자에게 요청해 주세요.</p>
      </form>
    </main>
  );
}
