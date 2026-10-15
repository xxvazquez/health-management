// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PullToRefresh } from "./PullToRefresh";

const syncNow = vi.fn(async () => {});
vi.mock("@/lib/DataContext", () => ({ useData: () => ({ syncNow, refresh: vi.fn(async () => {}), isDemoData: false }) }));

afterEach(cleanup);

function drag(points: [number, number][]) {
  const page = screen.getByText("Page");
  const [first, ...rest] = points;
  fireEvent.touchStart(page, { touches: [{ clientX: first[0], clientY: first[1] }] });
  for (const [x, y] of rest) fireEvent.touchMove(page, { touches: [{ clientX: x, clientY: y }] });
  return page.parentElement as HTMLElement;
}

describe("PullToRefresh", () => {
  it("pulls the page down for a vertical drag from the top", () => {
    render(<PullToRefresh><p>Page</p></PullToRefresh>);
    const content = drag([[150, 100], [152, 120], [153, 200]]);
    expect(parseFloat(content.style.marginTop)).toBeGreaterThan(0);
  });

  it("leaves the page still for a sideways swipe that drifts down", () => {
    render(<PullToRefresh><p>Page</p></PullToRefresh>);
    const content = drag([[150, 100], [180, 110], [300, 140]]);
    expect(parseFloat(content.style.marginTop)).toBe(0);
  });

  it("ignores the iOS back swipe from the left edge", () => {
    render(<PullToRefresh><p>Page</p></PullToRefresh>);
    const content = drag([[5, 100], [8, 140], [10, 220]]);
    expect(parseFloat(content.style.marginTop)).toBe(0);
  });
});
