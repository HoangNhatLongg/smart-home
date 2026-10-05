"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { Badge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextField } from "@/components/ui/Field";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import { ApiError, createHome, getHome, listHomes } from "@/lib/api";

export default function HomesPage() {
  const resource = usePollingResource(async () => {
    const homes = await listHomes();
    const details = await Promise.all(
      homes.map(async (home) => ({ home, detail: await getHome(home.id).catch(() => null) })),
    );
    return details;
  }, { intervalMs: 60_000 });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createHome(name.trim());
      setName("");
      setCreating(false);
      resource.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không tạo được ngôi nhà.");
    } finally {
      setSaving(false);
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
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{home.name}</p>
                  {selected === home.id && <Badge tone="info">Đang chọn</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {detail?.roomCount ?? home.roomCount ?? "—"} phòng ·{" "}
                  {detail?.deviceCount ?? home.deviceCount ?? "—"} thiết bị
                </p>
              </div>
              <Button
                variant={selected === home.id ? "secondary" : "primary"}
                size="sm"
                onClick={() => setSelected(home.id)}
              >
                {selected === home.id ? "Đang dùng" : "Chọn"}
              </Button>
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
    </div>
  );
}