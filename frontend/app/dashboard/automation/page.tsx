"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { AutomationList } from "@/components/automation/AutomationList";
import { AutomationForm } from "@/components/automation/AutomationForm";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";
import { usePollingResource } from "@/lib/hooks/usePollingResource";
import { ApiError, deleteAutomation, getAutomationLogs, listAutomations } from "@/lib/api";
import { readLatestAutomationLogs } from "@/lib/automation-log";
import type { Automation } from "@/lib/api/contract";

export default function AutomationPage() {
  const tree = useDeviceTree();
  const homeId = tree.snapshot?.home?.id ?? null;

  const resource = usePollingResource(() => listAutomations(homeId ?? ""), {
    intervalMs: 60_000,
    enabled: homeId !== null,
    deps: [homeId],
  });

  const automations = resource.data ?? [];
  const automationKey = automations.map((item) => item.id).join("|");

  // One request per automation, every 60s. A single failing log never blocks
  // the list: `Promise.all` over per-item catches, and unreadable payloads are
  // dropped by readAutomationLog.
  const logsResource = usePollingResource(async () => {
    const entries = await Promise.all(
      automations.map(async (automation) => {
        try {
          return [automation.id, await getAutomationLogs(automation.id)] as const;
        } catch {
          return [automation.id, []] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }, { intervalMs: 60_000, enabled: automations.length > 0, deps: [automationKey] });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async (automation: Automation) => {
    if (!window.confirm(`Xóa tự động hóa "${automation.name}"? Lịch sử chạy của rule này cũng sẽ bị xóa.`)) return;
    setDeletingId(automation.id);
    setError(null);
    try {
      await deleteAutomation(automation.id);
      resource.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không xóa được lịch.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hẹn giờ"
        description="Bật/tắt relay theo giờ hoặc tưới cây khi cảm biến báo đất khô."
        meta={<PollBadge updatedAt={resource.lastUpdatedAt} busy={resource.loading} />}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={resource.refresh}
              icon={<RefreshCw size={14} strokeWidth={1.75} aria-hidden />}
            >
              Làm mới
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              disabled={homeId === null}
              icon={<Plus size={14} strokeWidth={1.75} aria-hidden />}
            >
              Thêm lịch
            </Button>
          </>
        }
      />

      <DataState
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.refresh}
        isEmpty={automations.length === 0}
        emptyMessage="Chưa có tự động hóa nào. Thêm lịch hoặc rule tưới theo độ ẩm đất."
      >
        <AutomationList
          automations={automations}
          devices={tree.snapshot?.devices ?? []}
          lastRuns={readLatestAutomationLogs(logsResource.data ?? {})}
          deletingId={deletingId}
          onEdit={(automation) => {
            setEditing(automation);
            setModalOpen(true);
          }}
          onDelete={(automation) => void onDelete(automation)}
        />
      </DataState>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <Modal
        open={modalOpen}
        title={editing ? "Sửa lịch" : "Thêm lịch"}
        onClose={() => setModalOpen(false)}
      >
        {homeId && (
          <AutomationForm
            homeId={homeId}
            devices={tree.snapshot?.devices ?? []}
            automation={editing}
            onClose={() => setModalOpen(false)}
            onSaved={resource.refresh}
          />
        )}
      </Modal>
    </div>
  );
}
