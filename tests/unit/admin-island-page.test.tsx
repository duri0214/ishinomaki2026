// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { island } = vi.hoisted(() => ({
  island: {
    id: "island-1",
    slug: "sample",
    name: "Sample Island",
    imageUrl: null,
    worldX: 0,
    worldY: 0,
    members: [],
    topTags: [],
  },
}));

vi.mock("next/link", () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/features/islands/admin-actions", () => ({
  createAdminTopicsAction: vi.fn(),
  saveAdminIslandAction: vi.fn(),
  saveAdminIslandTraitsAction: vi.fn(),
  saveAdminTopicAction: vi.fn(),
}));
vi.mock("@/features/islands/load", () => ({
  loadIsland: vi.fn().mockResolvedValue({ id: island.id, description: null }),
}));
vi.mock("@/features/map/data", () => ({
  getMapData: vi.fn().mockResolvedValue([island]),
}));
vi.mock("@/features/tags/queries", () => ({
  listTopicTags: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/traits/service", () => ({
  getIslandTraits: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/islands/TopicEditor", () => ({ TopicEditor: () => null }));
vi.mock("@/features/traits/TraitsEditor", () => ({ TraitsEditor: () => null }));
vi.mock("@/features/islands/IslandEditor", async () => {
  const { useQueryClient } = await import("@tanstack/react-query");
  return {
    IslandEditor: () => {
      useQueryClient();
      return <output data-testid="query-client">available</output>;
    },
  };
});

import AdminIslandPage from "@/app/admin/islands/[island]/page";

afterEach(() => cleanup());

it("renders the admin island editor with a React Query client", async () => {
  render(
    await AdminIslandPage({ params: Promise.resolve({ island: island.slug }) }),
  );

  expect(screen.getByTestId("query-client").textContent).toBe("available");
});
