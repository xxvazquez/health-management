// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async () => ({ error: null }));
const del = vi.fn(() => ({ eq: () => ({ eq: async () => ({}) }) }));
vi.mock("./supabase/client", () => ({
  supabaseConfigured: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ upsert, delete: del }),
  },
}));

const subscription = {
  endpoint: "https://push.example/1",
  toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
};
const pushManager = { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn() };
let permission: NotificationPermission = "default";

async function loadPush() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AAAA");
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ pushManager }) } });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", {
    get permission() {
      return permission;
    },
    requestPermission: vi.fn(async () => (permission = "granted")),
  });
  return import("./push");
}

describe("ensurePushNotifications", () => {
  beforeEach(() => {
    localStorage.clear();
    upsert.mockClear();
    permission = "default";
  });

  it("asks for permission when it was never asked", async () => {
    const push = await loadPush();
    expect(await push.ensurePushNotifications("u1")).toBe("needs-permission");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("re-subscribes silently when permission is granted", async () => {
    permission = "granted";
    const push = await loadPush();
    expect(await push.ensurePushNotifications("u1")).toBe("done");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("leaves a denied permission alone", async () => {
    permission = "denied";
    const push = await loadPush();
    expect(await push.ensurePushNotifications("u1")).toBe("done");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stays off after switching off, until switched back on", async () => {
    permission = "granted";
    const push = await loadPush();
    await push.disablePushNotifications();
    expect(await push.ensurePushNotifications("u1")).toBe("done");
    expect(upsert).not.toHaveBeenCalled();

    await push.enablePushNotifications();
    upsert.mockClear();
    await push.ensurePushNotifications("u1");
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
