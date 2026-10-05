"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PollBadge } from "@/components/dashboard/PollBadge";
import { RoomList } from "@/components/rooms/RoomList";
import { useDeviceTree } from "@/lib/hooks/useDeviceTree";

export default function RoomsPage() {
  const tree = useDeviceTree();
  const snapshot = tree.snapshot;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Phòng"
        description="Thiết bị được nhóm theo phòng để dễ tìm và dễ kiểm tra."
        meta={
          <>
            <span>{snapshot?.home?.name ?? "Chưa có ngôi nhà"}</span>
            <PollBadge updatedAt={tree.updatedAt} busy={tree.status === "loading"} />
          </>
        }
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
        isEmpty={snapshot !== null && snapshot.rooms.length === 0}
        emptyMessage="Chưa có phòng nào trong ngôi nhà này."
      >
        <RoomList rooms={snapshot?.rooms ?? []} devices={snapshot?.devices ?? []} />
      </DataState>
    </div>
  );
}