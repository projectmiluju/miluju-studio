#!/usr/bin/env bun
/**
 * miluju-studio MCP 브라우저 서버
 *
 * @playwright/mcp 위에 한글 검수, 접근성, 디자인 토큰 검증 도구를 추가한
 * miluju 전용 MCP 서버입니다.
 *
 * 사용법:
 *   bun run browse          (stdio 모드 — AI 에이전트가 직접 연결)
 *   bun run browse --port 3100  (SSE 모드 — 웹 클라이언트 연결)
 */

import { createConnection } from "@playwright/mcp";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, type BrowserContext, type Page } from "playwright";
import { createMiluConfig } from "./config.js";
import { runKoreanAudit, formatKoreanAuditReport } from "./tools/korean-audit.js";
import { runA11yAudit, formatA11yAuditReport } from "./tools/a11y-audit.js";
import { runDesignTokenAudit, formatDesignTokenReport } from "./tools/design-token-audit.js";

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
  const config = createMiluConfig();
  if (config.browser?.initScript) {
    for (const scriptPath of config.browser.initScript) {
      const script = await Bun.file(scriptPath).text();
      await page.addInitScript(script);
    }
  }

  if (url) {
    await page.goto(url, { waitUntil: "networkidle" });
    // 페이지 로드 후 initScript 재실행 (이미 로드된 페이지에는 addInitScript가 적용 안 됨)
    const scriptPath = config.browser?.initScript?.[0];
    if (scriptPath) {
      const script = await Bun.file(scriptPath).text();
      await page.evaluate(script);
    }
  } else {
    // 현재 페이지에 헬퍼가 없으면 주입
    const hasHelper = await page.evaluate(() => !!window.__miluju).catch(() => false);
    if (!hasHelper) {
      const scriptPath = config.browser?.initScript?.[0];
      if (scriptPath) {
        const script = await Bun.file(scriptPath).text();
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
      const result = await runKoreanAudit(page);
      return formatKoreanAuditReport(result);
    }
    case "miluju_a11y_audit": {
      const result = await runA11yAudit(page);
      return formatA11yAuditReport(result);
    }
    case "miluju_design_token_audit": {
      const result = await runDesignTokenAudit(page);
      return formatDesignTokenReport(result);
    }
    case "miluju_full_audit": {
      const [korean, a11y, token] = await Promise.all([
        runKoreanAudit(page),
        runA11yAudit(page),
        runDesignTokenAudit(page),
      ]);
      return [
        formatKoreanAuditReport(korean),
        "---",
        formatA11yAuditReport(a11y),
        "---",
        formatDesignTokenReport(token),
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

  console.error("🚀 miluju-browse MCP 서버 시작 (stdio 모드)");

  const transport = new StdioServerTransport();
  await server.connect(transport);

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
