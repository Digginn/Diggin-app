import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { AdminIcon } from "../../../components/AdminIcon";
import type { ContentType } from "../../../components/Badges";

export type ContentTypeFilter = "all" | ContentType;
const OPTIONS: { value: ContentTypeFilter; label: string }[] = [
  { value: "all", label: "전체 유형" },
  { value: "post", label: "게시글" },
  { value: "comment", label: "댓글" },
];

export function ContentTypeSelect({
  value,
  onChange,
  initialOpen = false,
}: {
  value: ContentTypeFilter;
  onChange: (value: ContentTypeFilter) => void;
  initialOpen?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = OPTIONS.findIndex((option) => option.value === value);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useLayoutEffect(() => {
    if (!isOpen) return;
    function positionList() {
      const trigger = triggerRef.current;
      const list = listRef.current;
      if (!trigger || !list) return;
      const bounds = trigger.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(bounds.right - list.offsetWidth, window.innerWidth - list.offsetWidth - 8),
      );
      const top =
        bounds.bottom + 6 + list.offsetHeight <= window.innerHeight - 8
          ? bounds.bottom + 6
          : Math.max(8, bounds.top - list.offsetHeight - 6);
      list.style.left = `${left}px`;
      list.style.top = `${top}px`;
    }
    positionList();
    triggerRef.current?.focus({ preventScroll: true });
    window.addEventListener("resize", positionList);
    window.addEventListener("scroll", positionList, true);
    return () => {
      window.removeEventListener("resize", positionList);
      window.removeEventListener("scroll", positionList, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function dismissOutside(event: FocusEvent) {
      if (
        event.target instanceof Node &&
        !triggerRef.current?.contains(event.target) &&
        !listRef.current?.contains(event.target)
      )
        setIsOpen(false);
    }
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [isOpen]);

  function select(index: number) {
    onChange(OPTIONS[index].value);
    setIsOpen(false);
    triggerRef.current?.focus();
  }
  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      if (isOpen) onChange(OPTIONS[activeIndex].value);
      setIsOpen(false);
      return;
    }
    if (event.key === "Escape") {
      if (isOpen) event.preventDefault();
      setIsOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (!isOpen) {
      setActiveIndex(
        event.key === "Home" ? 0 : event.key === "End" ? OPTIONS.length - 1 : selectedIndex,
      );
      setIsOpen(true);
      return;
    }
    if (event.key === "ArrowDown")
      setActiveIndex((index) => Math.min(index + 1, OPTIONS.length - 1));
    if (event.key === "ArrowUp") setActiveIndex((index) => Math.max(index - 1, 0));
    if (event.key === "Home") setActiveIndex(0);
    if (event.key === "End") setActiveIndex(OPTIONS.length - 1);
    if (event.key === "Enter" || event.key === " ") select(activeIndex);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="report-type-select"
        aria-label="콘텐츠 유형"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
        data-selected={value !== "all"}
        onKeyDown={handleKey}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setIsOpen((open) => !open);
        }}
      >
        <span>{OPTIONS[selectedIndex].label}</span>
        <AdminIcon asset="select-chevron" size={16} />
      </button>
      {isOpen &&
        createPortal(
          <>
            <button
              className="content-type-backdrop"
              type="button"
              tabIndex={-1}
              aria-label="유형 선택 닫기"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setIsOpen(false)}
            />
            <div
              ref={listRef}
              id={listId}
              className="content-type-dropdown"
              role="listbox"
              aria-label="콘텐츠 유형 옵션"
            >
              {OPTIONS.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  id={`${listId}-${index}`}
                  tabIndex={-1}
                  aria-selected={option.value === value}
                  data-active={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => select(index)}
                >
                  <span>{option.label}</span>
                  {option.value === value && <AdminIcon name="check" size={16} />}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
