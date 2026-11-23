import { useEffect, useId, useRef, useState } from "react";

import { LogoutDialog } from "../screens/auth/LogoutDialog";

import { AdminBrand } from "./AdminBrand";
import { AdminIcon } from "./AdminIcon";
import { NavItem } from "./NavItem";

export function AdminSidebar({
  email,
  count,
  initialProfileOpen = false,
  initialLogoutOpen = false,
  reportsHref = "#/preview/reports",
  activePage = "reports",
  onLogout,
}: {
  email: string;
  count?: number;
  initialProfileOpen?: boolean;
  initialLogoutOpen?: boolean;
  reportsHref?: string;
  activePage?: "reports" | "sanctions" | "members" | "analytics-consent";
  onLogout: () => Promise<void>;
}) {
  const [isProfileOpen, setIsProfileOpen] = useState(initialProfileOpen);
  const [isLogoutOpen, setIsLogoutOpen] = useState(initialLogoutOpen);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isProfileOpen) return;
    function dismissOutside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target))
        setIsProfileOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsProfileOpen(false);
        profileButtonRef.current?.focus();
      }
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();
        menuItemRef.current?.focus();
      }
    }
    menuItemRef.current?.focus();
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isProfileOpen]);

  function closeLogout() {
    setIsLogoutOpen(false);
    profileButtonRef.current?.focus();
  }
  return (
    <>
      <aside className="admin-sidebar" aria-label="관리자 내비게이션">
        <div className="admin-sidebar__brand">
          <AdminBrand />
        </div>
        <p className="admin-sidebar__group">커뮤니티 운영</p>
        <nav>
          <NavItem
            href={reportsHref}
            label="신고 관리"
            count={count}
            isActive={activePage === "reports"}
            iconAsset={activePage !== "reports" ? "operations-nav-report" : undefined}
          />
          <NavItem
            href={reportsHref.replace(/reports$/, "sanctions")}
            label="제재 이력"
            icon="shield"
            isActive={activePage === "sanctions"}
            iconAsset={activePage === "members" ? "operations-nav-shield" : undefined}
          />
          <NavItem
            href={reportsHref.replace(/reports$/, "members")}
            label="회원 관리"
            icon="user"
            isActive={activePage === "members"}
            iconAsset={activePage === "sanctions" ? "operations-nav-user" : undefined}
          />
        </nav>
        <hr className="admin-sidebar__divider" />
        <p className="admin-sidebar__group admin-sidebar__group--section">개인정보</p>
        <nav>
          <NavItem
            href={reportsHref.replace(/reports$/, "analytics-consent")}
            label="분석 동의 철회"
            isActive={activePage === "analytics-consent"}
            iconAsset="nav-unlock"
          />
        </nav>
        <div className="admin-profile" ref={profileRef}>
          <button
            ref={profileButtonRef}
            className="admin-profile__button"
            type="button"
            aria-label={`운영자 ${email} 프로필 메뉴`}
            aria-haspopup="menu"
            aria-expanded={isProfileOpen}
            aria-controls={menuId}
            onClick={() => setIsProfileOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIsProfileOpen(true);
              }
            }}
          >
            <span className="admin-profile__avatar">D</span>
            <span className="admin-profile__info">
              <span>운영자</span>
              <span>{email}</span>
            </span>
          </button>
          {isProfileOpen && (
            <div className="profile-menu" id={menuId} role="menu" aria-label="프로필 메뉴">
              <button
                ref={menuItemRef}
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsProfileOpen(false);
                  setIsLogoutOpen(true);
                }}
              >
                <AdminIcon name="logout" size={18} />
                로그아웃
              </button>
            </div>
          )}
        </div>
      </aside>
      <LogoutDialog isOpen={isLogoutOpen} onCancel={closeLogout} onLogout={onLogout} />
    </>
  );
}
