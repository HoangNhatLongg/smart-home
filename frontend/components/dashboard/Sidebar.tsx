"use client";

import {
  Bot,
  Boxes,
  Cpu,
  House,
  LayoutDashboard,
  MapPin,
  Mic,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/dashboard/homes", label: "Ngôi nhà", icon: House },
  { href: "/dashboard/rooms", label: "Phòng", icon: MapPin },
  { href: "/dashboard/devices", label: "Thiết bị", icon: Cpu },
  { href: "/dashboard/environment", label: "Môi trường", icon: Thermometer },
  { href: "/dashboard/automation", label: "Hẹn giờ", icon: Bot },
  { href: "/dashboard/ota", label: "Cập nhật", icon: Boxes },
  { href: "/dashboard/voice", label: "Giọng nói", icon: Mic },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Đóng menu"
          onClick={onNavigate}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      )}
      <nav
        aria-label="Điều hướng chính"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-150 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-line px-4 py-4">
          <p className="text-sm font-semibold text-ink">Nhà thông minh</p>
          <p className="text-xs text-ink-subtle">Bảng điều khiển</p>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-2.5 rounded-md py-2 pl-3 pr-3 text-sm transition-colors duration-150 ${
                    active
                      ? "bg-accent-subtle font-medium text-accent before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}