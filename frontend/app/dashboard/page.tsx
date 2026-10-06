"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, CalendarClock, Cpu, House, Plus, RefreshCw, Thermometer } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { SummaryStrip } from "@/components/dashboard/SummaryStrip";
import { RoomOverviewCard } from "@/components/dashboard/RoomOverviewCard";
import { DeviceCard } from "@/components/devices/DeviceCard";
import { CommandFeedback } from "@/components/devices/CommandFeedback";
import { useDeviceTree, telemetryValueOf } from "@/lib/hooks/useDeviceTree";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import { listAutomations } from "@/lib/api";
import { formatHumidity, formatRelativeTime, formatTemperature } from "@/lib/format";

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export default function OverviewPage() {
  const tree = useDeviceTree();
  const tracker = useCommandTracker({ onConfirmed: tree.refresh });
  const snapshot = tree.snapshot;
  const homeId = snapshot?.home?.id ?? null;
  const automations = usePollingResource(() => listAutomations(homeId ?? ""), { intervalMs: 60_000, enabled: homeId !== null, deps: [homeId] });
  const devices = useMemo(() => snapshot?.devices ?? [], [snapshot]);
  const rooms = snapshot?.rooms ?? [];
  const online = devices.filter((device) => device.status === "online").length;
  const onlineDevices = devices.filter((device) => device.status === "online");
  const temperatures = onlineDevices.map((device) => telemetryValueOf(snapshot?.telemetry[device.deviceId], "temperature")).filter((value): value is number => value !== null);
  const humidities = onlineDevices.map((device) => telemetryValueOf(snapshot?.telemetry[device.deviceId], "humidity")).filter((value): value is number => value !== null);
  const priorityDevices = devices.filter((device) => device.status === "online" || device.capabilities.some((capability) => capability.code === "relay")).slice(0, 4);
  const recentActivity = devices.filter((device) => device.lastSeenAt).map((device) => ({ device, at: device.lastSeenAt as string })).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);

  return <div className="space-y-6">
    <PageHeader title="Tổng quan" description="Giám sát và điều khiển hệ thống nhà thông minh." actions={<Button variant="secondary" size="sm" onClick={tree.refresh} icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}>Làm mới</Button>} />
    <DataState loading={tree.status === "loading" && snapshot === null} error={tree.error} onRetry={tree.refresh}>
      <div className="space-y-6">
        <SummaryStrip homeCount={snapshot?.homes.length ?? 0} homeNames={(snapshot?.homes ?? []).map((item) => item.name).join(", ")} online={online} deviceCount={devices.length} roomCount={rooms.length} averageTemperature={average(temperatures)} averageHumidity={average(humidities)}><span className="text-xs text-ink-subtle">{tree.updatedAt ? `Cập nhật ${formatRelativeTime(new Date(tree.updatedAt).toISOString())}` : "Chưa cập nhật"}</span></SummaryStrip>
        {(snapshot?.homes.length ?? 0) === 0 ? <EmptyState icon={House} title="Chưa có ngôi nhà" description="Tạo ngôi nhà đầu tiên để bắt đầu quản lý phòng và thiết bị." message="Chưa có ngôi nhà." action={<Link href="/dashboard/homes" className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"><Plus size={15} aria-hidden />Quản lý ngôi nhà</Link>} /> : <>
          <DashboardSection title="Phòng trong nhà" description="Theo dõi nhanh từng không gian." href="/dashboard/rooms" link="Xem tất cả">
            {rooms.length === 0 ? <EmptyState icon={House} title="Chưa có phòng nào" description="Thêm phòng để nhóm thiết bị và theo dõi môi trường theo khu vực." message="Chưa có phòng nào." action={<Link href="/dashboard/rooms" className="text-sm font-medium text-accent hover:underline">Quản lý phòng</Link>} /> : <div className="space-y-5">{(snapshot?.homes ?? []).map((home) => { const homeRooms = rooms.filter((room) => room.homeId === home.id); if (homeRooms.length === 0) return null; return <div key={home.id}><h3 className="mb-2 text-sm font-semibold text-ink">{home.name}</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{homeRooms.map((room) => <RoomOverviewCard key={room.id} roomId={room.id} roomName={room.name} devices={devices.filter((device) => device.roomId === room.id)} telemetry={snapshot?.telemetry ?? {}} />)}</div></div>; })}</div>}
          </DashboardSection>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
            <DashboardSection title="Thiết bị quan trọng" description="Điều khiển relay sau khi thiết bị xác nhận trạng thái." href="/dashboard/devices" link="Tất cả thiết bị">
              {priorityDevices.length === 0 ? <EmptyState icon={Cpu} title="Chưa có thiết bị" description="Thiết bị sẽ xuất hiện ở đây khi được kết nối với ngôi nhà." message="Chưa có thiết bị." /> : <div className="grid gap-4 md:grid-cols-2">{priorityDevices.map((device) => <DeviceCard key={device.deviceId} device={device} state={snapshot?.states[device.deviceId] ?? null} telemetry={snapshot?.telemetry[device.deviceId] ?? null} tracker={tracker} />)}</div>}
            </DashboardSection>
            <div className="space-y-6">
              <Section title="Nhiệt độ & độ ẩm" description="Trung bình từ các thiết bị đang gửi telemetry.">{temperatures.length === 0 && humidities.length === 0 ? <EmptyState icon={Thermometer} title="Chưa có dữ liệu môi trường" message="Khi thiết bị gửi telemetry, số đo sẽ hiển thị tại đây." className="py-7" /> : <dl className="grid grid-cols-2 gap-3"><Metric label="Nhiệt độ" value={formatTemperature(average(temperatures))} /><Metric label="Độ ẩm" value={formatHumidity(average(humidities))} /></dl>}<Link href="/dashboard/environment" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Xem theo thiết bị <ArrowUpRight size={13} aria-hidden /></Link></Section>
              <Section title="Hoạt động gần đây" description="Tín hiệu mới nhất thực sự nhận từ thiết bị.">{recentActivity.length === 0 ? <EmptyState icon={Activity} title="Chưa có hoạt động gần đây" message="Hoạt động từ thiết bị sẽ hiển thị ở đây." className="py-7" /> : <ul className="divide-y divide-line">{recentActivity.map(({ device, at }) => <li key={device.deviceId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ok-subtle text-ok"><Activity size={16} aria-hidden /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{device.name} vừa gửi tín hiệu</p><p className="mt-0.5 text-xs text-ink-subtle">{device.roomName ?? device.deviceId}</p></div><time className="shrink-0 text-xs text-ink-subtle">{formatRelativeTime(at)}</time></li>)}</ul>}</Section>
            </div>
          </div>
          <Section title="Tự động hóa sắp tới" description="Các lịch đang được cấu hình cho ngôi nhà." actions={<Link href="/dashboard/automation" className="text-xs font-medium text-accent hover:underline">Quản lý lịch</Link>}>{automations.data?.length ? <div className="grid gap-3 md:grid-cols-2">{automations.data.slice(0, 4).map((automation) => <div key={automation.id} className="flex items-center gap-3 rounded-md border border-line bg-surface-muted px-3 py-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-700"><CalendarClock size={18} aria-hidden /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{automation.name}</p><p className="mt-0.5 text-xs text-ink-subtle">Mỗi ngày · {automation.schedule.time} · {automation.enabled ? "Đang bật" : "Đang tắt"}</p></div></div>)}</div> : <EmptyState icon={CalendarClock} title="Chưa có lịch tự động nào" message={automations.error ? "Không tải được lịch tự động. Vui lòng thử lại ở trang Tự động hóa." : "Tạo lịch để thiết bị tự bật hoặc tắt theo giờ."} className="py-7" action={<Link href="/dashboard/automation" className="text-sm font-medium text-accent hover:underline">+ Tạo tự động hóa</Link>} />}</Section>
        </>}
      </div>
    </DataState>
    <CommandFeedback tracker={tracker} states={snapshot?.states ?? {}} devices={devices} />
  </div>;
}

function DashboardSection({ title, description, href, link, children }: { title: string; description: string; href: string; link: string; children: React.ReactNode }) {
  return <section><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-ink">{title}</h2><p className="mt-0.5 text-sm text-ink-subtle">{description}</p></div><Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline">{link} <ArrowUpRight size={14} aria-hidden /></Link></div>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-surface-muted p-3"><dt className="text-xs text-ink-subtle">{label}</dt><dd className="mt-1 text-xl font-semibold text-ink">{value}</dd></div>; }
