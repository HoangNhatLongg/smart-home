"use client";

import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardGrid } from "@/components/ui/Card";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toaster";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { CommandFeedback } from "@/components/devices/CommandFeedback";
import { DeviceCard } from "@/components/devices/DeviceCard";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import type { DeviceStatus } from "@/lib/api/contract";
import { deleteDevice, pairDevice, updateDeviceBroker } from "@/lib/api";

type Filter = "all" | DeviceStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "online", label: "Hoạt động" },
  { value: "offline", label: "Mất kết nối" },
  { value: "unknown", label: "Không rõ" },
];

export default function DevicesPage() {
  const { notify } = useToast();
  const tree = useDeviceTree();
  const tracker = useCommandTracker({ onConfirmed: tree.refresh });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [homeId, setHomeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [mqttUri, setMqttUri] = useState("");
  const [brokerDeviceId, setBrokerDeviceId] = useState<string | null>(null);
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        actions={<div className="flex gap-2"><Button size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Thêm thiết bị</Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={tree.refresh}
            icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}
          >
            Làm mới
          </Button>
        </div>}
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

      <CommandFeedback tracker={tracker} states={snapshot?.states ?? {}} devices={allDevices} />
      <Modal open={adding} title="Ghép nối thiết bị" onClose={() => setAdding(false)} footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Huỷ</Button><Button disabled={busy || !pairingCode || !deviceName.trim() || !homeId || !roomId || !mqttUri.trim()} onClick={async () => { setBusy(true); try { await pairDevice({ pairingCode: pairingCode.trim().toUpperCase(), name: deviceName.trim(), homeId, roomId, mqttUri: mqttUri.trim() }); notify({ message: "Đã ghép nối thiết bị", tone: "success" }); setAdding(false); setPairingCode(""); setDeviceName(""); tree.refresh(); } catch (cause) { notify({ message: cause instanceof Error ? cause.message : "Không ghép nối được", tone: "error" }); } finally { setBusy(false); } }}>{busy ? "Đang ghép nối..." : "Ghép nối"}</Button></>}>
        <div className="space-y-4"><p className="text-sm text-ink-muted">Nhập mã hiển thị sau khi ESP lưu Wi-Fi. Chọn đúng nhà và phòng cho thiết bị.</p>
          <TextField label="Mã ghép nối" value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase())} maxLength={10} />
          <TextField label="Tên thiết bị" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={64} />
          <SelectField label="Ngôi nhà" value={homeId} onChange={(event) => { setHomeId(event.target.value); setRoomId(""); }}><option value="">Chọn ngôi nhà</option>{(snapshot?.homes ?? []).map((home) => <option key={home.id} value={home.id}>{home.name}</option>)}</SelectField>
          <SelectField label="Phòng" value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Chọn phòng</option>{(snapshot?.rooms ?? []).filter((room) => room.homeId === homeId).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</SelectField>
          <TextField label="Địa chỉ MQTT broker mà ESP truy cập được" value={mqttUri} onChange={(event) => setMqttUri(event.target.value)} placeholder="mqtt://192.168.1.10:1883" />
        </div>
      </Modal>
      <div className="rounded-lg border border-line bg-surface p-4"><h2 className="font-semibold text-ink">Quản lý kết nối</h2><p className="mt-1 text-sm text-ink-muted">ESP lấy địa chỉ MQTT mới từ Backend khi còn kết nối Wi-Fi.</p><ul className="mt-3 divide-y divide-line">{allDevices.map((device) => <li key={device.deviceId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-sm font-medium text-ink">{device.name}</span><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => { setBrokerDeviceId(device.deviceId); setMqttUri(""); }}>Đổi MQTT</Button><Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeletingDeviceId(device.deviceId)}>Bỏ ghép nối</Button></div></li>)}</ul></div>
      <Modal open={brokerDeviceId !== null} title="Đổi địa chỉ MQTT" onClose={() => setBrokerDeviceId(null)} footer={<><Button variant="secondary" onClick={() => setBrokerDeviceId(null)}>Huỷ</Button><Button disabled={busy || !mqttUri.trim()} onClick={async () => { if (!brokerDeviceId) return; setBusy(true); try { await updateDeviceBroker(brokerDeviceId, mqttUri.trim()); notify({ message: "Đã lưu địa chỉ MQTT mới", tone: "success" }); setBrokerDeviceId(null); } catch (cause) { notify({ message: cause instanceof Error ? cause.message : "Không đổi được broker", tone: "error" }); } finally { setBusy(false); } }}>Lưu</Button></>}><TextField label="MQTT URI" value={mqttUri} onChange={(event) => setMqttUri(event.target.value)} placeholder="mqtt://192.168.1.20:1883" /></Modal>
      <Modal open={deletingDeviceId !== null} title="Xác nhận bỏ ghép nối" onClose={() => setDeletingDeviceId(null)} footer={<><Button variant="secondary" onClick={() => setDeletingDeviceId(null)}>Không xóa</Button><Button variant="danger" disabled={busy} onClick={async () => { if (!deletingDeviceId) return; setBusy(true); try { await deleteDevice(deletingDeviceId); notify({ message: "Đã bỏ ghép nối thiết bị", tone: "success" }); setDeletingDeviceId(null); tree.refresh(); } catch (cause) { notify({ message: cause instanceof Error ? cause.message : "Không bỏ ghép nối được", tone: "error" }); } finally { setBusy(false); } }}>{busy ? "Đang xóa..." : "Bỏ ghép nối"}</Button></>}><p className="text-sm text-ink-muted">Thao tác này xóa thiết bị cùng dữ liệu telemetry, trạng thái, lệnh và OTA của thiết bị. ESP sẽ trở về trang cấu hình để ghép nối lại. Bạn chắc chắn muốn tiếp tục?</p></Modal>
    </div>
  );
}
