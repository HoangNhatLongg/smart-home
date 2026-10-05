import type { CommandStatus, DeviceStatus, OtaStatus } from "@/lib/api/contract";

const UNKNOWN = "—";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN;
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return UNKNOWN;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return UNKNOWN;
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 10) return "vừa xong";
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return `${days} ngày trước`;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return value.toFixed(digits);
}

export const formatTemperature = (value: number | null | undefined): string =>
  value === null || value === undefined ? UNKNOWN : `${formatNumber(value)}°C`;

export const formatHumidity = (value: number | null | undefined): string =>
  value === null || value === undefined ? UNKNOWN : `${formatNumber(value, 0)}%`;

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? UNKNOWN : `${Math.round(value)}%`;

export function formatStateValue(value: unknown): string {
  if (value === null || value === undefined) return UNKNOWN;
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (typeof value === "number") return formatNumber(value, 2);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Vietnamese wording for a relay position. null = no State read yet. */
export function formatRelayState(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "Chưa có trạng thái";
  return value ? "Bật" : "Tắt";
}

export const deviceStatusLabel = (status: DeviceStatus): string => {
  switch (status) {
    case "online":
      return "Đang hoạt động";
    case "offline":
      return "Mất kết nối";
    default:
      return "Không rõ";
  }
};

export const deviceStatusTone = (status: DeviceStatus): string => {
  switch (status) {
    case "online":
      return "text-ok";
    case "offline":
      return "text-bad";
    default:
      return "text-ink-subtle";
  }
};

export const commandStatusLabel = (status: CommandStatus): string => {
  switch (status) {
    case "PENDING":
      return "Đang chờ gửi";
    case "SENT":
      return "Đã gửi, chờ State xác nhận";
    case "SUCCESS":
      return "Thiết bị đã xác nhận";
    case "FAILED":
      return "Thất bại";
    case "TIMEOUT":
      return "Hết thời gian chờ";
    default:
      return status;
  }
};

export const otaStatusLabel = (status: OtaStatus): string => {
  switch (status) {
    case "PENDING":
      return "Đang chờ";
    case "DOWNLOADING":
      return "Đang tải firmware";
    case "INSTALLING":
      return "Đang cài đặt";
    case "REBOOTING":
      return "Đang khởi động lại";
    case "SUCCESS":
      return "Cập nhật thành công";
    case "FAILED":
      return "Cập nhật thất bại";
    default:
      return status;
  }
};