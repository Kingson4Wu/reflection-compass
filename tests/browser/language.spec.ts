import { test, expect } from "@playwright/test";
import { fillField } from "./edit-fields";

async function english(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

test("language switches immediately, persists on reload and returns to Chinese", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "今天", exact: true }),
  ).toBeVisible();
  await english(page);
  await expect(page).toHaveTitle("Settings · Reflection Compass");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page).toHaveTitle("设置 · Reflection Compass");
});

test("all English views use localized chrome at phone and desktop widths", async ({
  page,
}) => {
  await page.goto("./");
  await english(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ["Today", "Direction", "Pause", "Review", "Settings"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible();
      if (label === "Settings")
        for (const details of await page.locator("details").all())
          await details.evaluate((el) => {
            (el as HTMLDetailsElement).open = true;
          });
      const text = (await page.locator("body").innerText()).replaceAll(
        "简体中文",
        "",
      );
      expect(text).not.toMatch(/\p{Script=Han}/u);
      const chrome = await page
        .locator("[aria-label], [title], [placeholder], [alt]")
        .evaluateAll((elements) =>
          elements
            .flatMap((element) =>
              ["aria-label", "title", "placeholder", "alt"].map(
                (name) => element.getAttribute(name) ?? "",
              ),
            )
            .join("\n"),
        );
      expect(chrome).not.toMatch(/\p{Script=Han}/u);
      if (width === 390 && (label === "Today" || label === "Settings"))
        await page.screenshot({
          path: `.wrangler/english-${label.toLowerCase()}-390.png`,
        });
      if (width === 1440 && label === "Direction")
        await page.screenshot({ path: ".wrangler/english-direction-1440.png" });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    }
  }
});

test("switching language never translates or replaces personal records", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("今天");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await fillField(page, "我想过怎样的生活", "设置");
  await english(page);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "今天", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".direction-summary")).toContainText("设置");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator("h2.question")).not.toContainText("我正在");
});

test("English pause, action editing, completion and backup confirmation remain functional", async ({
  page,
}) => {
  await page.goto("./");
  await english(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose a question", exact: true })
    .click();
  const questions = page.getByRole("dialog", {
    name: "Choose a question",
    exact: true,
  });
  await questions
    .getByRole("button", {
      name: "What is the smallest next step I can take?",
      exact: true,
    })
    .click();
  await expect(page.locator("h2.question")).toHaveText(
    "What is the smallest next step I can take?",
  );
  await page
    .getByText("Write a line, or adjust your next step", { exact: true })
    .click();
  await page
    .getByLabel("Right now, I notice…", { exact: true })
    .fill("保留观察");
  await page
    .getByLabel("If I encounter this situation again, I will…", { exact: true })
    .fill("保留下一步");
  await page
    .getByRole("button", { name: "Use as today’s action", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "保留下一步", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit action: 保留下一步", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit action", exact: true });
  await editor.getByLabel("Action", { exact: true }).fill("更小的一步");
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("checkbox", { name: "更小的一步", exact: true }).check();
  await page
    .getByRole("button", { name: "Mark as incomplete", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "更小的一步", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".reflection-entry")).toContainText("保留观察");
  await expect(page.locator(".reflection-entry")).toContainText(
    "What is the smallest next step I can take?",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const { emptyState } = await import("../../src/domain");
  const file = page.getByLabel(
    "Choose a backup file (preview before making changes)",
    { exact: true },
  );
  await file.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "unknown", state: emptyState() }),
    ),
  });
  await expect(
    page.locator(".backup-settings").getByRole("status"),
  ).toContainText("Unsupported backup format or version.");
  await file.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "reflection-compass-v1", state: emptyState() }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Backup preview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Replace current content with backup",
      exact: true,
    })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Confirm action",
    exact: true,
  });
  await expect(confirmation).toContainText(
    "Replace local content with this backup",
  );
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "更小的一步", exact: true }),
  ).toBeVisible();
});

test("English choice and Chinese records survive a fully closed offline cold start", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("./");
  await english(page);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByLabel("Add today’s action", { exact: true })
    .fill("关闭后仍然保留");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("button.sync")).toContainText("Saved locally");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "关闭后仍然保留", exact: true }),
  ).toBeVisible();
  await context.newPage();
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto(baseURL!);
  await expect(reopened.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    reopened.getByRole("checkbox", { name: "关闭后仍然保留", exact: true }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: "Settings", exact: true }).click();
  const manifest = await reopened.evaluate(async () => {
    const url = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    )!.href;
    return (await fetch(url)).json();
  });
  expect(manifest.lang).toBe("en");
  expect(manifest.id).toBe(new URL(baseURL!).pathname);
  await reopened.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await expect(
    reopened.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
});

test.describe("notification language network flows", () => {
  // Route stubs must own the requests; WebKit can bypass them under a service worker.
  test.use({ serviceWorkers: "block" });
  test("reminder language updates without resubscribing and retries after connection failure", async ({
    page,
  }) => {
    const { readFile } = await import("node:fs/promises");
    const owner = (await readFile(".dev.vars", "utf8")).match(
      /^OWNER_TOKEN=(.+)$/m,
    )![1];
    const updates: string[] = [];
    let rejectEnglish = true;
    let subscriptions = 0;
    await page.route("**/api/subscription", async (route) => {
      if (route.request().method() === "PATCH") {
        const locale = route.request().postDataJSON().locale;
        updates.push(locale);
        await route.fulfill(
          rejectEnglish && locale === "en"
            ? { status: 503, json: { error: "服务暂时不可用，请稍后重试。" } }
            : { json: { ok: true, updated: false } },
        );
      } else {
        if (route.request().method() === "POST") subscriptions++;
        await route.continue();
      }
    });
    await page.goto("./");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByText("管理员恢复入口", { exact: true }).click();
    await page.getByLabel("个人访问密钥", { exact: true }).fill(owner);
    await page.getByRole("button", { name: "连接并同步", exact: true }).click();
    await expect(page.locator("button.sync")).toContainText("已同步到云端");
    await expect.poll(() => updates.includes("zh-CN")).toBe(true);
    await page.getByLabel("界面语言", { exact: true }).selectOption("en");
    await expect(
      page.getByText(
        "The interface language has changed. Reminder language will sync when you’re back online.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    rejectEnglish = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(() => updates.filter((value) => value === "en").length)
      .toBe(2);
    await expect(
      page.getByText(
        "The interface language has changed. Reminder language will sync when you’re back online.",
        { exact: true },
      ),
    ).toHaveCount(0);
    expect(subscriptions).toBe(0);
  });

  test("a language change during subscription creation finishes with the latest reminder language", async ({
    page,
  }) => {
    const { readFile } = await import("node:fs/promises");
    const owner = (await readFile(".dev.vars", "utf8")).match(
      /^OWNER_TOKEN=(.+)$/m,
    )![1];
    let savedLocale = "zh-CN";
    let postStarted = false;
    let releasePost!: () => void;
    const pending = new Promise<void>((resolve) => {
      releasePost = resolve;
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: class {
          static async requestPermission() {
            return "granted";
          }
        },
      });
      if (!("PushManager" in window))
        Object.defineProperty(window, "PushManager", {
          configurable: true,
          value: class {},
        });
      Object.defineProperty(navigator.serviceWorker, "ready", {
        configurable: true,
        get: () =>
          Promise.resolve({
            pushManager: {
              getSubscription: async () => ({
                toJSON: () => ({
                  endpoint: "https://web.push.apple.com/test",
                  keys: { auth: "a", p256dh: "b" },
                }),
              }),
            },
          }),
      });
    });
    await page.route("**/api/config", (route) =>
      route.fulfill({ json: { pushReady: true, publicKey: "AA" } }),
    );
    await page.route("**/api/subscription", async (route) => {
      if (route.request().method() === "POST") {
        postStarted = true;
        await pending;
        savedLocale = route.request().postDataJSON().locale;
        await route.fulfill({ json: { ok: true, target: true } });
      } else if (route.request().method() === "PATCH") {
        savedLocale = route.request().postDataJSON().locale;
        await route.fulfill({ json: { ok: true, updated: true } });
      } else await route.continue();
    });
    await page.goto("./");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByText("管理员恢复入口", { exact: true }).click();
    await page.getByLabel("个人访问密钥", { exact: true }).fill(owner);
    await page.getByRole("button", { name: "连接并同步", exact: true }).click();
    await expect(page.locator("button.sync")).toContainText("已同步到云端");
    await page
      .getByRole("button", { name: "在这台设备开启通知", exact: true })
      .click();
    await expect.poll(() => postStarted).toBe(true);
    // Another tab can change the device preference while the permission/save flow is pending.
    await page.evaluate(() => {
      const key = "compass-language:/reflection-compass/";
      localStorage.setItem(key, "en");
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: "en" }),
      );
    });
    await expect.poll(() => savedLocale).toBe("en");
    releasePost();
    await expect(page.locator("fieldset.workspace")).not.toBeDisabled();
    await expect.poll(() => savedLocale).toBe("en");
  });
});
