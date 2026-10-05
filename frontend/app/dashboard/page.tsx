"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { SummaryStrip } from "@/components/dashboard/SummaryStrip";
import { RoomRow } from "@/components/dashboard/RoomRow";
import { CommandFeedback, relayNamesOf } from "@/components/devices/CommandFeedback";
import { useDeviceTree, telemetryValueOf } from "@/lib/hooks/useDeviceTree";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import { formatRelativeTime } from "@/lib/format";

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

export default function OverviewPage() {
  const tree = useDeviceTree();
  const tracker = useCommandTracker({ onConfirmed: tree.refresh });
  const snapshot = tree.snapshot;

  const devices = snapshot?.devices ?? [];
  const rooms = snapshot?.rooms ?? [];
  const online = devices.filter((device) => device.status === "online").length;
  const temperatures = devices
    .map((device) => telemetryValueOf(snapshot?.telemetry[device.deviceId], "temperature"))
    .filter((value): value is number => value !== null);
  const humidities = devices
    .map((device) => telemetryValueOf(snapshot?.telemetry[device.deviceId], "humidity"))
    .filter((value): value is number => value !== null);

  const recentActivity = devices
    .filter((device) => device.lastSeenAt !== null)
    .map((device) => ({ device, at: device.lastSeenAt as string }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tổng quan"
        description="Phòng nào đang có thiết bị hoạt động, và các relay có thể điều khiển ngay tại đây."
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

      <DataState
        loading={tree.status === "loading" && snapshot === null}
        error={tree.error}
        onRetry={tree.refresh}
      >
        <div className="space-y-5">
          <SummaryStrip
            homeName={snapshot?.home?.name ?? null}
            online={online}
            deviceCount={devices.length}
            roomCount={rooms.length}
            averageTemperature={average(temperatures)}
            averageHumidity={average(humidities)}
          >
            <span className="text-xs text-ink-subtle">
              {tree.updatedAt ? `Cập nhật ${formatRelativeTime(new Date(tree.updatedAt).toISOString())}` : "Chưa cập nhật"}
            </span>
          </SummaryStrip>

          {rooms.length === 0 ? (
            <EmptyState message="Chưa có phòng nào. Thêm phòng để thiết bị được nhóm lại." />
          ) : (
            <div className="space-y-4">
              {rooms.map((room) => (
                <RoomRow
                  key={room.id}
                  roomId={room.id}
                  roomName={room.name}
                  devices={devices.filter((device) => device.roomId === room.id)}
                  states={snapshot?.states ?? {}}
                  telemetry={snapshot?.telemetry ?? {}}
                  tracker={tracker}
                />
              ))}
            </div>
          )}

          <Section title="Hoạt động gần đây" description="Thiết bị vừa gửi tín hiệu lên gần nhất.">
            {recentActivity.length === 0 ? (
              <EmptyState message="Chưa có thiết bị nào gửi tín hiệu." />
            ) : (
              <ul className="divide-y divide-line">
                {recentActivity.map(({ device, at }) => (
                  <li key={device.deviceId} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="min-w-0 truncate text-sm text-ink">{device.name}</span>
                    <span className="shrink-0 text-xs text-ink-subtle">
                      {formatRelativeTime(at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </DataState>

      <CommandFeedback
        tracker={tracker}
        states={snapshot?.states ?? {}}
        relayNames={relayNamesOf(devices)}
      />
    </div>
  );
}