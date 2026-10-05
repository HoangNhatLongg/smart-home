import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataState } from "@/components/ui/DataState";

describe("DataState", () => {
  it("shows the loading state only for the first load", () => {
    render(
      <DataState loading error={null}>
        <p>nội dung</p>
      </DataState>,
    );
    expect(screen.getByRole("status", { name: "Đang tải dữ liệu..." })).toBeInTheDocument();
    expect(screen.queryByText("nội dung")).not.toBeInTheDocument();
  });

  it("shows a retryable error and never the children", () => {
    const onRetry = vi.fn();
    render(
      <DataState loading={false} error="Phiên đăng nhập không hợp lệ." onRetry={onRetry}>
        <p>nội dung</p>
      </DataState>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Phiên đăng nhập không hợp lệ.");
    expect(screen.queryByText("nội dung")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });

  it("shows the empty message instead of an empty page", () => {
    render(
      <DataState loading={false} error={null} isEmpty emptyMessage="Chưa có automation nào.">
        <p>nội dung</p>
      </DataState>,
    );
    expect(screen.getByText("Chưa có automation nào.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the children in the success case", () => {
    render(
      <DataState loading={false} error={null}>
        <p>nội dung</p>
      </DataState>,
    );
    expect(screen.getByText("nội dung")).toBeInTheDocument();
  });
});