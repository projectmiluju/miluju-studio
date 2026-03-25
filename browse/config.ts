/**
 * miluju-studio 브라우저 래퍼 기본 설정
 *
 * @playwright/mcp의 Config를 miluju 기본값으로 확장합니다.
 * 한글 검수에 필요한 initScript, 뷰포트, 세션 유지 등을 설정합니다.
 */

import { resolve } from "node:path";

/**
 * @playwright/mcp Config 타입 (config.d.ts에서 subpath export가 안 되므로 필요한 부분만 정의)
 */
export interface MiluBrowserConfig {
  browser?: {
    browserName?: "chromium" | "firefox" | "webkit";
    isolated?: boolean;
    userDataDir?: string;
    launchOptions?: {
      headless?: boolean;
      executablePath?: string;
      channel?: string;
    };
    contextOptions?: {
      viewport?: { width: number; height: number };
      locale?: string;
      timezoneId?: string;
    };
    initScript?: string[];
  };
  capabilities?: string[];
  server?: { port?: number; host?: string };
  outputDir?: string;
  imageResponses?: "allow" | "omit" | "auto";
}

const BROWSE_ROOT = import.meta.dirname;

/** miluju 기본 브라우저 설정 */
export function createMiluConfig(overrides?: Partial<MiluBrowserConfig>): MiluBrowserConfig {
  const base: MiluBrowserConfig = {
    browser: {
      browserName: "chromium",
      // 세션 유지를 위한 user data directory
      userDataDir: resolve(BROWSE_ROOT, "..", ".browser-data"),
      launchOptions: {
        headless: true,
      },
      contextOptions: {
        // 한글 웹사이트 테스트에 적합한 뷰포트
        viewport: { width: 1440, height: 900 },
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
      },
      // 모든 페이지에 한글 검수 헬퍼 주입
      initScript: [
        resolve(BROWSE_ROOT, "init-scripts", "korean-helpers.js"),
      ],
    },
    capabilities: ["core", "vision", "testing"],
    outputDir: resolve(BROWSE_ROOT, "..", "dist", "browse-output"),
    imageResponses: "auto",
  };

  if (!overrides) return base;

  // 얕은 병합 (browser 필드는 깊은 병합)
  return {
    ...base,
    ...overrides,
    browser: {
      ...base.browser,
      ...overrides.browser,
      launchOptions: {
        ...base.browser?.launchOptions,
        ...overrides.browser?.launchOptions,
      },
      contextOptions: {
        ...base.browser?.contextOptions,
        ...overrides.browser?.contextOptions,
      },
    },
  };
}
