import { useState } from "react";

import type { NoticeDraft } from "../../api/notices";
import { AdminIcon } from "../../components/AdminIcon";

const DEVICES = [
  { label: "소형 Galaxy S25", width: 360, height: 780 },
  { label: "중형 iPhone 16", width: 393, height: 852 },
  { label: "대형 iPhone 17 Pro Max", width: 440, height: 956 },
];

export function NoticePreview({ draft }: { draft: NoticeDraft }) {
  const [mode, setMode] = useState("공지 상세");
  const [device, setDevice] = useState(1);
  const selected = DEVICES[device];
  return (
    <aside className="notice-preview-card" aria-label="앱 미리보기">
      <h2>앱 미리보기</h2>
      <div className="notice-preview-tabs" role="tablist" aria-label="미리보기 화면">
        {["공지 상세", "알림함"].map((label) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={mode === label}
            onClick={() => setMode(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="notice-preview-tabs" role="tablist" aria-label="미리보기 기기">
        {DEVICES.map(({ label }, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={device === index}
            onClick={() => setDevice(index)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="notice-phone" style={{ width: selected.width, height: selected.height }}>
        <div className="notice-phone-status">
          <div className="notice-phone-time">
            <strong>9:41</strong>
          </div>
          <span className="notice-phone-island" />
          <div className="notice-phone-levels">
            <img
              src={new URL("../../assets/notice-cellular.svg", import.meta.url).href}
              width="19.2"
              height="12.2264"
              alt=""
            />
            <img
              src={new URL("../../assets/notice-wifi.svg", import.meta.url).href}
              width="17.1417"
              height="12.3283"
              alt=""
            />
            <img
              src={new URL("../../assets/notice-battery.svg", import.meta.url).href}
              width="27.328"
              height="13"
              alt=""
            />
          </div>
        </div>
        <div className="notice-phone-bar">
          <span>
            <AdminIcon asset="notice-back" size={18} />
          </span>
          {mode === "공지 상세" ? "공지" : "알림"}
        </div>
        <div className="notice-phone-scroll">
          {mode === "알림함" ? (
            <div className="notice-preview-notification">
              <div>
                <span className="notice-operator">공지</span>
                <strong>{draft.title || "제목을 입력해 주세요."}</strong>
                <small>방금 전</small>
              </div>
              <p>{draft.inbox_body || draft.body || "알림함에 표시할 내용이 여기에 보입니다."}</p>
            </div>
          ) : (
            <>
              <header className="notice-phone-header">
                <span className="notice-preview-badge">공지</span>
                <h3>{draft.title || "제목을 입력해 주세요."}</h3>
                <div>
                  <strong>Diggin</strong>
                  <span className="notice-operator">운영자</span>
                  <small>
                    {new Intl.DateTimeFormat("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })
                      .format(new Date())
                      .replace(/\s|\.$/g, "")}
                  </small>
                </div>
              </header>
              <p className="notice-phone-body">{draft.body || "게시글 본문을 입력해 주세요."}</p>
              <div className="notice-preview-like">
                <span className="notice-preview-touch">
                  <img
                    src={new URL("../../assets/notice-heart.svg", import.meta.url).href}
                    alt=""
                  />
                </span>
                <span>1</span>
              </div>
              {!draft.comments_closed && (
                <div className="notice-preview-comments">
                  <div>
                    <span>디기 1 · N분 전</span>
                    <AdminIcon asset="notice-more" size={16} />
                  </div>
                  <p>좋은 소식이네요. 기대할게요!</p>
                </div>
              )}
            </>
          )}
        </div>
        {mode === "공지 상세" && !draft.comments_closed && (
          <div className="notice-preview-input">
            <div>
              <span>댓글을 입력해 주세요. (최대 150자)</span>
              <span className="notice-preview-send">
                <img src={new URL("../../assets/notice-send.svg", import.meta.url).href} alt="" />
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
