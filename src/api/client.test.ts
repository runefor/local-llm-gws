import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiError, fetchJson, postJson } from "./client";

const jsonResponse = (data: unknown, init?: { ok?: boolean; status?: number }): Response =>
  ({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => data,
  }) as unknown as Response;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("prefixes the path with API_BASE and returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJson<{ hello: string }>("/api/ping");

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/ping`, undefined);
    expect(result).toEqual({ hello: "world" });
  });

  it("throws ApiError with the status on a non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "boom" }, { ok: false, status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson("/api/fail")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      body: { detail: "boom" },
    });
    await expect(fetchJson("/api/fail")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("postJson", () => {
  it("sends a POST with JSON body and Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await postJson("/api/thing", { a: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/thing`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ a: 1 }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });
});
