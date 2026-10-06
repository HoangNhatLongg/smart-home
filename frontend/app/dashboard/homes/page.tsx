"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextField } from "@/components/ui/Field";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { useToast } from "@/components/ui/Toaster";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import { ApiError, createHome, deleteHome, getHome, listHomes, updateHome } from "@/lib/api";
import type { Home } from "@/lib/api";
import { refreshDeviceTree } from "@/lib/hooks/useDeviceTree";

export default function HomesPage() {
  const { notify } = useToast();
  const resource = usePollingResource(async () => {
    const homes = await listHomes();
    const details = await Promise.all(
      homes.map(async (home) => ({ home, detail: await getHome(home.id).catch(() => null) })),
    );
    return details;
  }, { intervalMs: 60_000 });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Home | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmingEdit, setConfirmingEdit] = useState(false);
  const [deleting, setDeleting] = useState<Home | null>(null);
  const [mutating, setMutating] = useState(false);

  const onCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createHome(name.trim());
      setName("");
      setCreating(false);
      resource.refresh();
      refreshDeviceTree();
      notify({ message: "Đã tạo ngôi nhà", tone: "success" });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không tạo được ngôi nhà.");
    } finally {
      setSaving(false);
    }
  };

  const onUpdate = async () => {
    if (!editing || !editName.trim() || mutating) return;
    setMutating(true);
    try {
      await updateHome(editing.id, editName.trim());
      notify({ message: "Đã cập nhật tên ngôi nhà", tone: "success" });
      setEditing(null);
      setConfirmingEdit(false);
      resource.refresh();
      refreshDeviceTree();
    } catch (cause) {
      notify({ message: cause instanceof ApiError ? cause.message : "Không sửa được ngôi nhà.", tone: "error" });
      setConfirmingEdit(false);
      setEditing(editing);
    } finally {
      setMutating(false);
    }
  };

  const onDelete = async () => {
    if (!deleting || mutating) return;
    setMutating(true);
    try {
      await deleteHome(deleting.id);
      notify({ message: `Đã xóa ${deleting.name}`, tone: "success" });
      setDeleting(null);
      resource.refresh();
      refreshDeviceTree();
    } catch (cause) {
      notify({ message: cause instanceof ApiError ? cause.message : "Không xóa được ngôi nhà.", tone: "error" });
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ngôi nhà"
        description="Mỗi ngôi nhà gom các phòng và thiết bị của một hộ gia đình."
        meta={<PollBadge updatedAt={resource.lastUpdatedAt} busy={resource.loading} />}
        actions={
          <Button onClick={() => setCreating(true)} icon={<Plus size={14} strokeWidth={1.75} aria-hidden />}>
            Tạo ngôi nhà
          </Button>
        }
      />

      <DataState
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.refresh}
        isEmpty={resource.data !== null && resource.data.length === 0}
        emptyMessage="Chưa có ngôi nhà nào. Bấm “Tạo ngôi nhà” để bắt đầu."
      >
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {(resource.data ?? []).map(({ home, detail }) => (
            <li
              key={home.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{home.name}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {detail?.roomCount ?? home.roomCount ?? "—"} phòng ·{" "}
                  {detail?.deviceCount ?? home.deviceCount ?? "—"} thiết bị
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" icon={<Pencil size={14} aria-hidden />} onClick={() => { setEditing(home); setEditName(home.name); }}>
                  Sửa
                </Button>
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden />} onClick={() => setDeleting(home)}>
                  Xóa
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DataState>

      <Modal
        open={creating}
        title="Tạo ngôi nhà"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Huỷ
            </Button>
            <Button onClick={onCreate} disabled={saving || !name.trim()}>
              {saving ? "Đang tạo..." : "Tạo"}
            </Button>
          </>
        }
      >
        <TextField
          label="Tên ngôi nhà"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nhà chính"
          hint="Bạn có thể đổi tên thiết bị và phòng sau trong từng mục."
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {error}
          </p>
        )}
      </Modal>

      <Modal
        open={editing !== null && !confirmingEdit}
        title="Sửa ngôi nhà"
        onClose={() => setEditing(null)}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Huỷ</Button><Button disabled={!editName.trim() || mutating} onClick={() => setConfirmingEdit(true)}>Lưu thay đổi</Button></>}
      >
        <TextField label="Tên ngôi nhà" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} />
      </Modal>

      <Modal
        open={confirmingEdit}
        title="Xác nhận thay đổi"
        onClose={() => setConfirmingEdit(false)}
        footer={<><Button variant="secondary" onClick={() => setConfirmingEdit(false)}>Xem lại</Button><Button disabled={mutating} onClick={() => void onUpdate()}>{mutating ? "Đang lưu..." : "Xác nhận sửa"}</Button></>}
      >
        <p className="text-sm text-ink-muted">Bạn chắc chắn muốn đổi tên <strong>{editing?.name}</strong> thành <strong>{editName.trim()}</strong> chứ?</p>
      </Modal>

      <Modal
        open={deleting !== null}
        title="Xác nhận xóa ngôi nhà"
        onClose={() => { if (!mutating) setDeleting(null); }}
        footer={<><Button variant="secondary" disabled={mutating} onClick={() => setDeleting(null)}>Không xóa</Button><Button variant="danger" disabled={mutating} onClick={() => void onDelete()}>{mutating ? "Đang xóa..." : "Xóa ngôi nhà"}</Button></>}
      >
        <p className="text-sm text-ink-muted"><strong>Xóa nhà sẽ xóa tất cả phòng và thiết bị.</strong> Bạn chắc chắn muốn xóa chứ?</p>
      </Modal>
    </div>
  );
}
