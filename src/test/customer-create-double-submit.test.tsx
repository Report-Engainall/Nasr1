import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createCustomer: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, createCustomer: mocks.createCustomer };
});

import { CustomerModal } from "@/components/AghbariApp";

describe("admin customer creation submission", () => {
  beforeEach(() => {
    mocks.createCustomer.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sends only one create request for rapid submits dispatched before rerender", async () => {
    let finishCreate: (() => void) | undefined;
    mocks.createCustomer.mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishCreate = () => resolve(); }),
    );
    const onSaved = vi.fn();
    render(<CustomerModal onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("اسم المنشأة"), { target: { value: "مؤسسة الاختبار" } });
    const submit = screen.getByRole("button", { name: "حفظ العميل" });

    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.createCustomer).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => {
      finishCreate?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("rejects a blank business name before calling the create service", async () => {
    render(<CustomerModal onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("اسم المنشأة"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ العميل" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("اسم المنشأة مطلوب");
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it("releases the submit guard after a failed request so the user can retry", async () => {
    mocks.createCustomer
      .mockRejectedValueOnce(new Error("تعذر حفظ العميل"))
      .mockResolvedValueOnce(undefined);
    const onSaved = vi.fn();
    render(<CustomerModal onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("اسم المنشأة"), { target: { value: "مؤسسة الاختبار" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ العميل" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر حفظ العميل");
    fireEvent.click(screen.getByRole("button", { name: "حفظ العميل" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.createCustomer).toHaveBeenCalledTimes(2);
  });
});
