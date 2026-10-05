"use client";

import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardGrid } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { CommandFeedback, relayNamesOf } from "@/components/devices/CommandFeedback";
import { DeviceCard } from "@/components/devices/DeviceCard";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import type { DeviceStatus } from "@/lib/api/contract";

type Filter = "all" | DeviceStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "online", label: "Hoạt động" },
  { value: "offline", label: "Mất kết nối" },
  { value: "unknown", label: "Không rõ" },
];

export default function DevicesPage() {
  const tree = useDeviceTree();
  const tracker = useCommandTracker({ onConfirmed: tree.refresh });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const snapshot = tree.snapshot;
  const allDevices = useMemo(() => snapshot?.devices ?? [], [snapshot]);

  const devices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allDevices.filter((device) => {
      if (filter !== "all" && device.status !== filter) return false;
      if (!needle) return true;
      return (
        device.name.toLowerCase().includes(needle) ||
        device.deviceId.toLowerCase().includes(needle) ||
        (device.roomName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [allDevices, filter, query]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thiết bị"
        description="Toàn bộ thiết bị trong nhà. Bật/tắt relay ngay tại đây hoặc mở chi tiết để xem lịch sử."
        meta={<PollBadge updatedAt={tree.updatedAt} busy={tree.status === "loading"} />}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={tree.refresh}
            icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}
          >
            Làm mới
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Lọc theo trạng thái"
          className="inline-flex w-full rounded-md border border-line bg-surface p-0.5 sm:w-auto"
        >
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 sm:flex-none ${
                filter === item.value
                  ? "bg-accent-subtle text-accent"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
          />
          <label htmlFor="device-search" className="sr-only">
            Tìm thiết bị
          </label>
          <input
            id="device-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc mã"
            className="w-full rounded-md border border-line-strong bg-surface py-2 pr-3 pl-8 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <DataState
        loading={tree.status === "loading" && snapshot === null}
        error={tree.error}
        onRetry={tree.refresh}
        isEmpty={snapshot !== null && devices.length === 0}
        emptyMessage="Không có thiết bị nào khớp bộ lọc hoặc từ khoá tìm kiếm."
      >
        <CardGrid>
          {devices.map((device) => (
            <DeviceCard
              key={device.deviceId}
              device={device}
              state={snapshot?.states[device.deviceId] ?? null}
              telemetry={snapshot?.telemetry[device.deviceId] ?? null}
              tracker={tracker}
            />
          ))}
        </CardGrid>
      </DataState>

      <CommandFeedback
        tracker={tracker}
        states={snapshot?.states ?? {}}
        relayNames={relayNamesOf(allDevices)}
      />
    </div>
  );
}