import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Device, Room } from "@/lib/api/contract";

const CATEGORY_LABELS: Record<Room["category"], string> = {
  living_room: "Phòng khách",
  bedroom: "Phòng ngủ",
  kitchen: "Nhà bếp",
  bathroom: "Phòng tắm",
  office: "Phòng làm việc",
  dining_room: "Phòng ăn",
  garage: "Gara",
  outdoor: "Ngoài trời",
  other: "Khác",
};

/** One `Section` per room; devices are `divide-y` rows instead of nested cards. */
export function RoomList({ rooms, devices, onEdit, onDelete }: { rooms: Room[]; devices: Device[]; onEdit?: (room: Room) => void; onDelete?: (room: Room) => void }) {
  return (
    <div className="space-y-4">
      {rooms.map((room) => {
        const roomDevices = devices.filter((device) => device.roomId === room.id);
        const online = roomDevices.filter((device) => device.status === "online").length;
        return (
          <Section
            key={room.id}
            id={room.id}
            title={room.name}
            description={`${CATEGORY_LABELS[room.category]}${room.floor === null ? "" : ` · Tầng ${room.floor}`} · ${roomDevices.length} thiết bị · ${online} đang hoạt động`}
            actions={(onEdit || onDelete) && <div className="flex gap-1">{onEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(room)} icon={<Pencil size={14} />}>Sửa</Button>}{onDelete && <Button size="sm" variant="ghost" onClick={() => onDelete(room)} icon={<Trash2 size={14} />}>Xóa</Button>}</div>}
            flush
          >
            {roomDevices.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-subtle">Chưa có thiết bị trong phòng này.</p>
            ) : (
              <ul className="divide-y divide-line">
                {roomDevices.map((device) => (
                  <li
                    key={device.deviceId}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <Link
                      href={`/dashboard/devices/${encodeURIComponent(device.deviceId)}`}
                      className="min-w-0 flex-1 truncate text-sm text-ink hover:text-accent hover:underline"
                    >
                      {device.name}
                    </Link>
                    <span className="shrink-0 text-xs text-ink-subtle">{device.deviceId}</span>
                    <StatusBadge status={device.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}
    </div>
  );
}
