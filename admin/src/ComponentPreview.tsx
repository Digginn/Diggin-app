import { useCallback, useState, type ReactNode } from "react";

import { ActionReasonField } from "./components/ActionReasonField";
import { AdminBtn, type AdminBtnVariant } from "./components/AdminBtn";
import { AdminIcon, AdminWordmark, ICON_NAMES } from "./components/AdminIcon";
import { AdminToast } from "./components/AdminToast";
import {
  ReasonTag,
  REPORT_STATUSES,
  StatusBadge,
  TypeBadge,
  type ReportStatus,
} from "./components/Badges";
import { FilterTab, type ReportFilter } from "./components/FilterTab";
import { HistoryItem } from "./components/HistoryItem";
import { NavItem } from "./components/NavItem";
import { ReportRow, type ReportRowData } from "./components/ReportRow";
import { SanctionSelect, type Sanction } from "./components/SanctionSelect";
import { StatusSegment } from "./components/StatusSegment";
import { VisibilityControl } from "./components/VisibilityControl";

const FIGMA_URL = "https://www.figma.com/design/lMapbeiSGxEBJYaKa5hc9N?node-id=7068-140643";
const COUNTS = { all: 18, received: 7, reviewing: 4, resolved: 5, rejected: 2 };
const BUTTON_VARIANTS: AdminBtnVariant[] = [
  "primary",
  "secondary",
  "outline",
  "danger",
  "disabled",
];
const EXAMPLE_REPORT: ReportRowData = {
  id: "30",
  type: "post",
  title: "게시글 #30",
  excerpt:
    "FT-RPT-005-02 동일 콘텐츠 신고 그룹화를 점검중입니다. 모두가 이 글을 신고하고 댓글 달아주세요!!!",
  author: "디깅러버",
  authorId: "6775…0834a",
  reportCount: 3,
  reasons: [
    { label: "욕설·비방", count: 1 },
    { label: "부적절한 콘텐츠", count: 1 },
    { label: "기타", count: 1 },
  ],
  latestAt: "10.26 19:49",
  firstAt: "10.26 19:05",
  status: "received",
};

function PreviewSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="preview-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="preview-section__heading">
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function FilterExample({ initial }: { initial: ReportFilter }) {
  const [selected, setSelected] = useState(initial);
  return <FilterTab selected={selected} onChange={setSelected} counts={COUNTS} />;
}

function SegmentExample({ initial }: { initial: ReportStatus }) {
  const [selected, setSelected] = useState(initial);
  return <StatusSegment selected={selected} onChange={setSelected} />;
}

function SanctionExample({ initial }: { initial: Sanction | null }) {
  const [selected, setSelected] = useState(initial);
  return <SanctionSelect selected={selected} onChange={setSelected} />;
}

function VisibilityExample({ initial }: { initial: boolean }) {
  const [isHidden, setIsHidden] = useState(initial);
  return <VisibilityControl isHidden={isHidden} onChange={setIsHidden} />;
}

export function ComponentPreview() {
  const [hasButtonIcons, setHasButtonIcons] = useState(false);
  const [reason, setReason] = useState("");
  const [filledReason, setFilledReason] = useState(
    "동일 게시글에 욕설·비방 신고가 반복 접수되어 커뮤니티 운영정책 3조에 따라 7일 이용 제한합니다.",
  );
  const [toast, setToast] = useState({ id: 0, message: "", isVisible: false });
  const dismissToast = useCallback(
    () => setToast((current) => ({ ...current, isVisible: false })),
    [],
  );
  const showToast = (message: string) =>
    setToast((current) => ({ id: current.id + 1, message, isVisible: true }));

  return (
    <>
      <header className="preview-header">
        <div className="preview-header__brand">
          <AdminWordmark />
          <span>관리자 컴포넌트</span>
        </div>
        <a href={FIGMA_URL} target="_blank" rel="noreferrer">
          Figma 원본 <AdminIcon name="chevron-right" size={16} />
        </a>
      </header>
      <main className="preview-main">
        <div className="preview-intro">
          <span className="preview-eyebrow">DIGGIN ADMIN · COMPONENTS</span>
          <h1>관리자 컴포넌트</h1>
          <p>신고 관리에 사용하는 공통 UI와 상태별 동작을 확인합니다.</p>
          <p className="preview-notice">
            미리보기의 모든 내용은 예시입니다. 선택과 입력은 이 화면에서만 바뀝니다.
          </p>
        </div>
        <nav className="preview-jump-links" aria-label="컴포넌트 바로가기">
          <a href="#icons">아이콘</a>
          <a href="#badges">배지</a>
          <a href="#buttons">버튼</a>
          <a href="#filters">필터·상태</a>
          <a href="#sanctions">제재 선택</a>
          <a href="#visibility">공개·숨김</a>
          <a href="#report-row">신고 목록</a>
          <a href="#fields">조치 사유</a>
          <a href="#history">처리 이력</a>
        </nav>

        <PreviewSection
          id="icons"
          title="Icons / Wordmark"
          description="24px 아이콘 19종과 관리자 워드마크"
        >
          <div className="preview-icon-strip">
            {ICON_NAMES.map((name) => (
              <span key={name} title={name}>
                <AdminIcon name={name} />
                <span className="sr-only">{name}</span>
              </span>
            ))}
          </div>
          <div className="preview-brand-row">
            <AdminWordmark />
            <span>Wordmark/Admin · 80 × 25.6</span>
          </div>
        </PreviewSection>

        <PreviewSection
          id="badges"
          title="StatusBadge / TypeBadge / ReasonTag"
          description="신고 상태 4종, 콘텐츠 유형 2종, 사유별 건수"
        >
          <div className="preview-row">
            {REPORT_STATUSES.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
          <div className="preview-row">
            <TypeBadge type="post" />
            <TypeBadge type="comment" />
            <ReasonTag label="욕설·비방" count={1} />
            <ReasonTag label="부적절한 콘텐츠" count={1} />
            <ReasonTag label="기타" />
          </div>
        </PreviewSection>

        <PreviewSection
          id="buttons"
          title="AdminBtn"
          description="Primary / Secondary / Outline / Danger / Disabled · M 40px / S 32px"
        >
          <label className="preview-checkbox">
            <input
              type="checkbox"
              checked={hasButtonIcons}
              onChange={(event) => setHasButtonIcons(event.target.checked)}
            />
            아이콘 표시
          </label>
          {(["m", "s"] as const).map((size) => (
            <div className="preview-row" key={size}>
              {BUTTON_VARIANTS.map((variant) => (
                <div className="preview-sample" key={variant}>
                  <span className="preview-label">
                    {variant} / {size.toUpperCase()}
                  </span>
                  <AdminBtn
                    variant={variant}
                    size={size}
                    icon={hasButtonIcons ? "refresh" : undefined}
                    onClick={() => showToast("버튼을 선택했어요.")}
                  >
                    버튼
                  </AdminBtn>
                </div>
              ))}
            </div>
          ))}
        </PreviewSection>

        <PreviewSection
          id="filters"
          title="FilterTab / StatusSegment"
          description="필터와 신고 상태를 눌러 선택을 변경할 수 있습니다."
        >
          <div className="preview-two-column">
            <div className="preview-stack preview-scroll">
              {(["all", ...REPORT_STATUSES] as const).map((status) => (
                <FilterExample key={status} initial={status} />
              ))}
            </div>
            <div className="preview-stack">
              {REPORT_STATUSES.map((status) => (
                <SegmentExample key={status} initial={status} />
              ))}
            </div>
          </div>
        </PreviewSection>

        <PreviewSection
          id="sanctions"
          title="SanctionSelect"
          description="선택 없음과 제재 4종. 선택한 카드를 다시 누르면 해제됩니다."
        >
          <div className="preview-panel-grid">
            {([null, "warning", "community_restricted", "suspended", "release"] as const).map(
              (value) => (
                <div className="preview-sample" key={value ?? "none"}>
                  <span className="preview-label">{value ?? "None"}</span>
                  <SanctionExample initial={value} />
                </div>
              ),
            )}
          </div>
        </PreviewSection>

        <PreviewSection
          id="visibility"
          title="VisibilityControl"
          description="공개·숨김 상태와 버튼 전환"
        >
          <div className="preview-panel-grid">
            <VisibilityExample initial={false} />
            <VisibilityExample initial />
          </div>
        </PreviewSection>

        <PreviewSection
          id="report-row"
          title="ReportRow"
          description="기본 상태 / 마우스를 올린 상태. 행을 누르면 예시 알림이 표시됩니다."
        >
          <div className="preview-scroll">
            <ReportRow
              report={EXAMPLE_REPORT}
              onOpen={(id) => showToast(`게시글 #${id}을 선택했어요.`)}
            />
            <div className="preview-hover-row">
              <ReportRow
                report={EXAMPLE_REPORT}
                onOpen={(id) => showToast(`게시글 #${id}을 선택했어요.`)}
              />
            </div>
          </div>
        </PreviewSection>

        <PreviewSection
          id="navigation"
          title="NavItem"
          description="선택 / 기본 / 배지 없는 내비게이션"
        >
          <div className="preview-row">
            <NavItem href="#report-row" label="신고 관리" count={7} isActive />
            <NavItem href="#report-row" label="신고 관리" count={7} />
            <NavItem href="#history" label="처리 이력" icon="clock" />
          </div>
        </PreviewSection>

        <PreviewSection
          id="fields"
          title="ActionReasonField"
          description="최대 200자 입력. 입력란에 포커스하면 테두리가 진해집니다."
        >
          <div className="preview-panel-grid">
            <ActionReasonField value={reason} onChange={setReason} />
            <ActionReasonField
              value={filledReason}
              onChange={setFilledReason}
              label="작성된 조치 사유"
            />
          </div>
        </PreviewSection>

        <PreviewSection
          id="history"
          title="HistoryItem"
          description="제재 / 해제 / 콘텐츠·상태 이력과 마지막 항목의 연결선"
        >
          <div className="preview-panel-grid">
            <div>
              <HistoryItem
                action="커뮤니티 이용 제한 7일"
                time="10.26 20:02"
                meta="운영자 diggin.app · 부적절한 콘텐츠 · 11.02 20:02 종료"
                reason="부적절한 표현이 반복되어 이용을 제한합니다."
              />
              <HistoryItem
                action="제재 해제"
                time="10.27 10:00"
                meta="운영자 diggin.app · 기타"
                reason="이의 신청 내용을 확인하여 제재를 해제합니다."
                kind="release"
                hasLine={false}
              />
            </div>
            <div>
              <HistoryItem
                action="콘텐츠 숨김"
                time="10.26 19:55"
                meta="운영자 diggin.app · 부적절한 콘텐츠"
                kind="content"
                reason="신고 내용을 검토하는 동안 콘텐츠를 숨깁니다."
              />
              <HistoryItem
                action="검토 중으로 변경"
                time="10.26 19:50"
                meta="운영자 diggin.app"
                kind="status"
                hasLine={false}
              />
            </div>
          </div>
        </PreviewSection>

        <PreviewSection
          id="toast"
          title="AdminToast"
          description="화면 하단 중앙에 표시되며 2.5초 뒤 사라집니다."
        >
          <AdminBtn variant="outline" icon="check" onClick={() => showToast("조치를 적용했어요.")}>
            토스트 표시
          </AdminBtn>
        </PreviewSection>
        <footer className="preview-footer">Diggin · 관리자 공통 컴포넌트</footer>
      </main>
      <div className="preview-toast-position">
        <AdminToast
          key={toast.id}
          message={toast.message}
          isVisible={toast.isVisible}
          onDismiss={dismissToast}
        />
      </div>
    </>
  );
}
