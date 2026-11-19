import { AdminBtn } from "./AdminBtn";
import { AdminIcon } from "./AdminIcon";

export function VisibilityControl({
  isHidden,
  onChange,
}: {
  isHidden: boolean;
  onChange: (isHidden: boolean) => void;
}) {
  return (
    <div className={`visibility-control ${isHidden ? "visibility-control--hidden" : ""}`}>
      <span className="visibility-control__icon">
        <AdminIcon asset={isHidden ? "visibility-eye-off" : "visibility-eye"} size={20} />
      </span>
      <div className="visibility-control__text">
        <p>{isHidden ? "숨김 처리됨" : "공개 중"}</p>
        <p>
          {isHidden
            ? "작성자 외 사용자에게 보이지 않습니다."
            : "앱에서 정상적으로 노출되고 있습니다."}
        </p>
      </div>
      <AdminBtn
        variant={isHidden ? "primary" : "outline"}
        size="s"
        onClick={() => onChange(!isHidden)}
      >
        <AdminIcon asset={isHidden ? "visibility-restore" : "visibility-hide"} size={16} />
        {isHidden ? "복구하기" : "숨기기"}
      </AdminBtn>
    </div>
  );
}
