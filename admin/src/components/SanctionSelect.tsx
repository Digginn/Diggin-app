import { AdminIcon, type AdminIconName } from "./AdminIcon";

export type Sanction = "warning" | "community_restricted" | "suspended" | "release";

const OPTIONS: { value: Sanction; label: string; description: string; icon: AdminIconName }[] = [
  {
    value: "warning",
    label: "경고",
    description: "기록만 남기고 이용은 제한하지 않습니다.",
    icon: "warning",
  },
  {
    value: "community_restricted",
    label: "커뮤니티 이용 제한",
    description: "7일 동안 게시글·댓글을 작성할 수 없습니다.",
    icon: "ban",
  },
  {
    value: "suspended",
    label: "계정 이용 정지",
    description: "로그인과 모든 기능 이용이 정지됩니다.",
    icon: "user",
  },
  {
    value: "release",
    label: "제재 해제",
    description: "진행 중인 모든 제재를 즉시 해제합니다.",
    icon: "unlock",
  },
];

export function SanctionSelect({
  selected,
  onChange,
  disabled = false,
}: {
  selected: Sanction | null;
  onChange: (sanction: Sanction | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="sanction-select" role="group" aria-label="작성자 제재 선택">
      {OPTIONS.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            className={`sanction-option ${option.value === "suspended" ? "sanction-option--danger" : ""}`}
            onClick={() => onChange(isSelected ? null : option.value)}
          >
            <span className="sanction-option__top">
              <AdminIcon name={option.icon} size={18} />
              <span className="sanction-option__label">{option.label}</span>
              <span className="sanction-option__radio">
                {isSelected && <AdminIcon asset="sanction-check" size={12} />}
              </span>
            </span>
            <span className="sanction-option__description">
              {option.value === "release" && isSelected
                ? "진행 중인 제재를 즉시 해제합니다."
                : option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
