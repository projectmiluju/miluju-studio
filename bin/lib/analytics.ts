/**
 * miluju-studio 텔레메트리 (Opt-in)
 *
 * 사용자가 명시적으로 동의한 경우에만 익명 사용 통계를 수집합니다.
 * - 어떤 명령어가 실행되었는가 (init, gen, eval, doctor 등)
 * - 사용 중인 스킬 개수
 * - 에이전트 타입
 *
 * 수집하지 않는 것:
 * - 코드 내용, 프롬프트 텍스트, 파일 경로, IP 주소
 * - 개인 식별 정보
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

interface AnalyticsConfig {
  enabled: boolean;
  anonymousId: string;
}

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: string;
  anonymousId: string;
}

const CONFIG_PATH_SEGMENT = ".milurc.json";

/**
 * 텔레메트리 설정을 읽습니다.
 */
async function loadConfig(projectDir: string): Promise<AnalyticsConfig> {
  const configPath = join(projectDir, CONFIG_PATH_SEGMENT);

  if (!existsSync(configPath)) {
    return { enabled: false, anonymousId: "" };
  }

  try {
    const raw = JSON.parse(await readFile(configPath, "utf-8"));
    return {
      enabled: raw.analytics === true,
      anonymousId: raw.anonymousId || "",
    };
  } catch {
    return { enabled: false, anonymousId: "" };
  }
}

/**
 * 텔레메트리 옵트인/옵트아웃을 설정합니다.
 */
export async function setAnalyticsEnabled(
  projectDir: string,
  enabled: boolean
): Promise<void> {
  const configPath = join(projectDir, CONFIG_PATH_SEGMENT);
  let config: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(await readFile(configPath, "utf-8"));
    } catch {
      // ignore
    }
  }

  config.analytics = enabled;
  if (enabled && !config.anonymousId) {
    config.anonymousId = randomUUID();
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  if (enabled) {
    console.log("✅ 텔레메트리 활성화됨 (익명 사용 통계만 수집)");
  } else {
    console.log("✅ 텔레메트리 비활성화됨");
  }
}

/**
 * 이벤트를 기록합니다.
 * 텔레메트리가 비활성화되어 있으면 아무 것도 하지 않습니다.
 *
 * 현재는 로컬 로그 파일에만 기록합니다.
 * 향후 원격 수집 엔드포인트를 추가할 수 있습니다.
 */
export async function trackEvent(
  projectDir: string,
  event: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  const config = await loadConfig(projectDir);
  if (!config.enabled) return;

  const analyticsEvent: AnalyticsEvent = {
    event,
    properties,
    timestamp: new Date().toISOString(),
    anonymousId: config.anonymousId,
  };

  // 로컬 로그 파일에 append
  const logPath = join(projectDir, ".miluju-analytics.log");
  const line = JSON.stringify(analyticsEvent) + "\n";

  try {
    const file = Bun.file(logPath);
    const existing = await file.exists() ? await file.text() : "";
    await Bun.write(logPath, existing + line);
  } catch {
    // 텔레메트리 실패는 무시
  }
}
