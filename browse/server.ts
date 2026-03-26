#!/usr/bin/env bun
/**
 * miluju-studio MCP 브라우저 서버
 *
 * @playwright/mcp 위에 한글 검수, 접근성, 디자인 토큰 검증 도구를 추가한
 * miluju 전용 MCP 서버입니다.
 *
 * 사용법:
 *   bun run browse                    (stdio 모드 개발 실행)
 *   bun run browse --port 3100        (SSE 모드 — 웹 클라이언트 연결)
 *   node dist/browse/server.js        (에이전트 연동용 stdio 번들)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { BrowserContext, Page } from "playwright";

async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

/** miluju 커스텀 MCP 도구 정의 */
const MILUJU_TOOLS = [
  {
    name: "miluju_korean_audit",
    description:
      "현재 브라우저 페이지의 한글 텍스트 렌더링 품질을 검사합니다. " +
      "word-break: keep-all 적용 여부, 텍스트 overflow, 한글 폰트 스택을 검증합니다.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "검사할 URL (생략하면 현재 페이지 검사)",
        },
      },
    },
  },
  {
    name: "miluju_a11y_audit",
    description:
      "웹페이지의 접근성을 WCAG 2.2 AA 기준으로 검사합니다. " +
      "색상 대비, 터치 타겟 크기, ARIA 라벨, alt 텍스트를 검증합니다.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "검사할 URL (생략하면 현재 페이지 검사)",
        },
      },
    },
  },
  {
    name: "miluju_design_token_audit",
    description:
      "페이지의 CSS 값이 디자인 토큰(CSS 변수)과 일치하는지 검사합니다. " +
      "하드코딩된 색상, 비일관적 간격, 타이포그래피 스케일을 검증합니다.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "검사할 URL (생략하면 현재 페이지 검사)",
        },
      },
    },
  },
  {
    name: "miluju_full_audit",
    description:
      "한글 검수 + 접근성 + 디자인 토큰을 한 번에 검사합니다. " +
      "1인 개발자가 배포 전 빠르게 품질을 확인할 때 사용합니다.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "검사할 URL (생략하면 현재 페이지 검사)",
        },
      },
    },
  },
] as const;

/** 브라우저 컨텍스트와 페이지 관리 */
let browserContext: BrowserContext | null = null;

async function getOrCreateContext(): Promise<BrowserContext> {
  if (browserContext) return browserContext;

  const { createMiluConfig } = await import("./config.js");
  const { chromium } = await import("playwright");
  const config = createMiluConfig();
  const browser = await chromium.launchPersistentContext(
    config.browser?.userDataDir || "",
    {
      headless: config.browser?.launchOptions?.headless ?? true,
      viewport: config.browser?.contextOptions?.viewport,
      locale: config.browser?.contextOptions?.locale,
      timezoneId: config.browser?.contextOptions?.timezoneId,
    }
  );

  browserContext = browser;
  return browser;
}

async function getActivePage(url?: string): Promise<Page> {
  const context = await getOrCreateContext();
  let page = context.pages()[0];

  if (!page) {
    page = await context.newPage();
  }

  // initScript 주입
  const { createMiluConfig } = await import("./config.js");
  const config = createMiluConfig();
  if (config.browser?.initScript) {
    for (const scriptPath of config.browser.initScript) {
      const script = await readTextFile(scriptPath);
      await page.addInitScript(script);
    }
  }

  if (url) {
    await page.goto(url, { waitUntil: "networkidle" });
    // 페이지 로드 후 initScript 재실행 (이미 로드된 페이지에는 addInitScript가 적용 안 됨)
    const scriptPath = config.browser?.initScript?.[0];
    if (scriptPath) {
      const script = await readTextFile(scriptPath);
      await page.evaluate(script);
    }
  } else {
    // 현재 페이지에 헬퍼가 없으면 주입
    const hasHelper = await page.evaluate(() => !!window.__miluju).catch(() => false);
    if (!hasHelper) {
      const scriptPath = config.browser?.initScript?.[0];
      if (scriptPath) {
        const script = await readTextFile(scriptPath);
        await page.evaluate(script);
      }
    }
  }

  return page;
}

/** miluju 커스텀 도구 실행 */
async function handleMiluTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const url = args.url as string | undefined;
  const page = await getActivePage(url);

  switch (name) {
    case "miluju_korean_audit": {
      const { runKoreanAudit, formatKoreanAuditReport } = await import("./tools/korean-audit.js");
      const result = await runKoreanAudit(page);
      return formatKoreanAuditReport(result);
    }
    case "miluju_a11y_audit": {
      const { runA11yAudit, formatA11yAuditReport } = await import("./tools/a11y-audit.js");
      const result = await runA11yAudit(page);
      return formatA11yAuditReport(result);
    }
    case "miluju_design_token_audit": {
      const { runDesignTokenAudit, formatDesignTokenReport } = await import("./tools/design-token-audit.js");
      const result = await runDesignTokenAudit(page);
      return formatDesignTokenReport(result);
    }
    case "miluju_full_audit": {
      const { runKoreanAudit: ka, formatKoreanAuditReport: fk } = await import("./tools/korean-audit.js");
      const { runA11yAudit: aa, formatA11yAuditReport: fa } = await import("./tools/a11y-audit.js");
      const { runDesignTokenAudit: da, formatDesignTokenReport: fd } = await import("./tools/design-token-audit.js");
      const [korean, a11y, token] = await Promise.all([
        ka(page),
        aa(page),
        da(page),
      ]);
      return [
        fk(korean),
        "---",
        fa(a11y),
        "---",
        fd(token),
      ].join("\n\n");
    }
    default:
      throw new Error(`알 수 없는 도구: ${name}`);
  }
}

/** MCP 서버 시작 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const portFlag = args.indexOf("--port");

  // SSE 모드: @playwright/mcp에 위임 (miluju 도구 미포함)
  if (portFlag !== -1) {
    const { createConnection } = await import("@playwright/mcp");
    const { createMiluConfig } = await import("./config.js");
    const port = parseInt(args[portFlag + 1]) || 3100;
    const config = createMiluConfig({
      server: { port },
    });
    console.log(`🌐 miluju 브라우저 서버 시작 (SSE 모드, 포트: ${port})`);
    await createConnection(config as Parameters<typeof createConnection>[0]);
    return;
  }

  // stdio 모드: miluju 커스텀 도구가 포함된 MCP 서버
  const server = new Server(
    {
      name: "miluju-browse",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 도구 목록 제공
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...MILUJU_TOOLS],
  }));

  // 도구 실행
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;

    try {
      const result = await handleMiluTool(name, toolArgs ?? {});
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `❌ 오류: ${message}` }],
        isError: true,
      };
    }
  });

  const fs = await import("node:fs");
  const debugLog = "/tmp/miluju-browse-debug.log";
  fs.writeFileSync(debugLog, `[${new Date().toISOString()}] MCP 서버 시작 시도\n`);

  process.on("beforeExit", (code) => {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] beforeExit: ${code}\n`);
  });
  process.on("exit", (code) => {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] exit: ${code}\n`);
  });
  process.stdin.on("end", () => {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] stdin end\n`);
  });
  process.stdin.on("close", () => {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] stdin close\n`);
  });

  console.error("🚀 miluju-browse MCP 서버 시작 (stdio 모드)");

  // Bun 환경에서는 stdio 서버가 별도 활성 핸들이 없으면 조용히 종료될 수 있으므로
  // stdin을 resumed 상태로 유지해 MCP 클라이언트의 초기화 메시지를 기다립니다.
  process.stdin.resume();

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] transport 연결 완료\n`);
  } catch (e) {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] 연결 오류: ${e}\n`);
    throw e;
  }

  // 종료 시 브라우저 정리
  process.on("SIGINT", async () => {
    if (browserContext) await browserContext.close();
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  console.error("❌ miluju-browse 서버 오류:", error);
  process.exit(1);
});
