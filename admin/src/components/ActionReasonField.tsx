import { useId } from "react";

const MAX_REASON_LENGTH = 200;

export function ActionReasonField({
  value,
  onChange,
  label = "조치 사유",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const counterId = useId();
  return (
    <div className="action-reason-field">
      <textarea
        aria-label={label}
        aria-describedby={counterId}
        value={value}
        maxLength={MAX_REASON_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder="조치 사유를 입력해 주세요. 사용자에게 공개되지 않는 내부 기록입니다."
      />
      <span id={counterId} className="action-reason-field__counter">
        {value.length}/{MAX_REASON_LENGTH}
      </span>
    </div>
  );
}
