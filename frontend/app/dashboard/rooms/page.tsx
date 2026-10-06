"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { RoomList } from "@/components/rooms/RoomList";
import { Modal } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toaster";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";
import { createRoom, deleteRoom, listHomes, updateRoom } from "@/lib/api";
import type { Room, RoomCategory } from "@/lib/api/contract";

const CATEGORIES: { value: RoomCategory; label: string }[] = [
  { value: "living_room", label: "Phòng khách" }, { value: "bedroom", label: "Phòng ngủ" },
  { value: "kitchen", label: "Nhà bếp" }, { value: "bathroom", label: "Phòng tắm" },
  { value: "office", label: "Phòng làm việc" }, { value: "dining_room", label: "Phòng ăn" },
  { value: "garage", label: "Gara" }, { value: "outdoor", label: "Khu vực ngoài trời" },
  { value: "other", label: "Khác" },
];

export default function RoomsPage() {
  const tree = useDeviceTree();
  const snapshot = tree.snapshot;
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [homes, setHomes] = useState<{ id: string; name: string }[]>([]);
  const [homeId, setHomeId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [category, setCategory] = useState<RoomCategory>("living_room");
  const [floor, setFloor] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [confirmingEdit, setConfirmingEdit] = useState(false);

  useEffect(() => { if (open) void listHomes().then(setHomes).catch(() => setHomes([])); }, [open]);

  const save = async () => {
    const numberFloor = floor.trim() === "" ? null : Number(floor);
    if (!roomName.trim() || !homeId || saving || (numberFloor !== null && (!Number.isInteger(numberFloor) || numberFloor < 0))) return;
    setSaving(true);
    try {
      if (editing) await updateRoom(editing.id, { name: roomName.trim(), category, floor: numberFloor });
      else await createRoom(homeId, { name: roomName.trim(), category, floor: numberFloor });
      notify({ message: editing ? "Đã cập nhật phòng" : "Đã thêm phòng mới", tone: "success" });
      setRoomName(""); setFloor(""); setEditing(null); setOpen(false); tree.refresh();
    } catch (cause) {
      notify({ message: cause instanceof Error ? cause.message : "Không thể lưu phòng", tone: "error" });
      if (editing) setOpen(true);
    }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <PageHeader title="Phòng" description="Tên phòng tự do, loại phòng được chuẩn hóa."
      meta={<><span>{snapshot?.homes.length ?? 0} ngôi nhà</span><PollBadge updatedAt={tree.updatedAt} busy={tree.status === "loading"} /></>}
      actions={<div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={tree.refresh} icon={<RefreshCw size={14} />}>Làm mới</Button><Button size="sm" onClick={() => { setEditing(null); setHomeId(""); setRoomName(""); setCategory("living_room"); setFloor(""); setOpen(true); }} icon={<Plus size={14} />}>Thêm phòng</Button></div>} />
    <DataState loading={tree.status === "loading" && snapshot === null} error={tree.error} onRetry={tree.refresh} isEmpty={snapshot !== null && snapshot.homes.length === 0} emptyMessage="Chưa có ngôi nhà. Hãy tạo ngôi nhà trước khi thêm phòng.">
      <div className="space-y-7">{(snapshot?.homes ?? []).map((home) => { const homeRooms=(snapshot?.rooms ?? []).filter((room) => room.homeId===home.id); return <section key={home.id}><h2 className="mb-3 text-base font-semibold text-ink">Phòng của {home.name}</h2>{homeRooms.length ? <RoomList rooms={homeRooms} devices={snapshot?.devices ?? []} onEdit={(room) => { setEditing(room); setHomeId(home.id); setRoomName(room.name); setCategory(room.category); setFloor(room.floor===null?"":String(room.floor)); setOpen(true); }} onDelete={setDeleting} /> : <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-subtle">Nhà này chưa có phòng.</p>}</section>; })}</div>
    </DataState>
    <Modal open={open} title={editing ? "Sửa phòng" : "Thêm phòng mới"} onClose={() => { setOpen(false); setEditing(null); }} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Huỷ</Button><Button onClick={() => { if (editing) { setOpen(false); setConfirmingEdit(true); } else void save(); }} disabled={saving || !roomName.trim() || !homeId}>{saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo phòng"}</Button></>}>
      <div className="space-y-4">
        <SelectField label="Thuộc ngôi nhà" value={homeId} disabled={editing !== null} onChange={(event) => setHomeId(event.target.value)}><option value="">Chọn ngôi nhà</option>{homes.map((home) => <option key={home.id} value={home.id}>{home.name}</option>)}</SelectField>
        <SelectField label="Loại phòng" value={category} onChange={(event) => setCategory(event.target.value as RoomCategory)}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectField>
        <TextField label="Tên phòng" placeholder="Ví dụ: Phòng ngủ 1" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={50} />
        <TextField label="Tầng (không bắt buộc)" type="number" min="0" inputMode="numeric" placeholder="Ví dụ: 2" value={floor} onChange={(event) => setFloor(event.target.value)} />
      </div>
    </Modal>
    <Modal open={confirmingEdit} title="Xác nhận thay đổi" onClose={() => { setConfirmingEdit(false); setOpen(true); }} footer={<><Button variant="secondary" onClick={() => { setConfirmingEdit(false); setOpen(true); }}>Xem lại</Button><Button onClick={() => { setConfirmingEdit(false); void save(); }}>Xác nhận sửa</Button></>}><p className="text-sm text-ink-muted">Bạn có chắc muốn lưu các thay đổi cho <strong>{editing?.name}</strong>?</p></Modal>
    <Modal open={deleting !== null} title="Xác nhận xóa phòng" onClose={() => setDeleting(null)} footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Không xóa</Button><Button variant="danger" onClick={async () => { if (!deleting) return; try { await deleteRoom(deleting.id); notify({message:`Đã xóa ${deleting.name}`,tone:"success"}); setDeleting(null); tree.refresh(); } catch (cause) { notify({message:cause instanceof Error?cause.message:"Không thể xóa phòng",tone:"error"}); } }}>Xóa phòng</Button></>}><p className="text-sm text-ink-muted">Bạn có chắc muốn xóa <strong>{deleting?.name}</strong>? Phòng có thiết bị sẽ không được phép xóa.</p></Modal>
  </div>;
}
