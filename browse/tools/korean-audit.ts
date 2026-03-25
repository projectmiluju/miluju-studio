/**
 * 한글 텍스트 검수 MCP 도구
 *
 * 브라우저 페이지의 한글 텍스트 렌더링 품질을 검사합니다.
 * - word-break: keep-all 적용 여부
 * - 한글 텍스트 overflow 감지
 * - 한글 폰트 스택 검증
 */

import type { Page } from "playwright";

/** 검수 결과 항목 */
export interface AuditFinding {
  selector: string;
  text: string;
  issue: string;
  computed: string;
}

/** 한글 검수 전체 결과 */
export interface KoreanAuditResult {
  url: string;
  timestamp: string;
  wordBreak: AuditFinding[];
  textOverflow: AuditFinding[];
  fontStack: AuditFinding[];
  summary: {
    total: number;
    critical: number;
    warning: number;
  };
}

/**
 * 현재 페이지에서 한글 텍스트 검수를 수행합니다.
 * init-scripts/korean-helpers.js가 주입된 상태에서 호출해야 합니다.
 */
export async function runKoreanAudit(page: Page): Promise<KoreanAuditResult> {
  const [wordBreak, textOverflow, fontStack] = await Promise.all([
    page.evaluate(() => window.__miluju.auditWordBreak()),
    page.evaluate(() => window.__miluju.auditTextOverflow()),
    page.evaluate(() => window.__miluju.auditFontStack()),
  ]);

  const critical = textOverflow.length;
  const warning = wordBreak.length + fontStack.length;

  return {
    url: page.url(),
    timestamp: new Date().toISOString(),
    wordBreak,
    textOverflow,
    fontStack,
    summary: {
      total: critical + warning,
      critical,
      warning,
    },
  };
}

/**
 * 검수 결과를 마크다운 리포트로 변환합니다.
 */
export function formatKoreanAuditReport(result: KoreanAuditResult): string {
  const lines: string[] = [
    `# 한글 텍스트 검수 리포트`,
    ``,
    `- **URL**: ${result.url}`,
    `- **검사 시각**: ${result.timestamp}`,
    `- **발견 항목**: ${result.summary.total}건 (심각 ${result.summary.critical}, 주의 ${result.summary.warning})`,
    ``,
  ];

  if (result.summary.total === 0) {
    lines.push(`✅ 한글 텍스트 렌더링 이상 없음`);
    return lines.join("\n");
  }

  if (result.textOverflow.length > 0) {
    lines.push(`## 🔴 텍스트 Overflow (${result.textOverflow.length}건)`);
    lines.push(``);
    for (const f of result.textOverflow) {
      lines.push(`- \`${f.selector}\``);
      lines.push(`  - 텍스트: "${f.text}..."`);
      lines.push(`  - 상태: ${f.computed}`);
    }
    lines.push(``);
  }

  if (result.wordBreak.length > 0) {
    lines.push(`## 🟡 Word-Break 미적용 (${result.wordBreak.length}건)`);
    lines.push(``);
    for (const f of result.wordBreak) {
      lines.push(`- \`${f.selector}\``);
      lines.push(`  - 텍스트: "${f.text}..."`);
      lines.push(`  - 현재 값: ${f.computed}`);
      lines.push(`  - 권장: \`word-break: keep-all\``);
    }
    lines.push(``);
  }

  if (result.fontStack.length > 0) {
    lines.push(`## 🟡 한글 폰트 미지정 (${result.fontStack.length}건)`);
    lines.push(``);
    for (const f of result.fontStack) {
      lines.push(`- \`${f.selector}\``);
      lines.push(`  - 현재: ${f.computed}`);
      lines.push(`  - 권장: Pretendard, Noto Sans KR 등 한글 폰트 추가`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

/** window.__miluju 타입 선언 (init-scripts/korean-helpers.js) */
declare global {
  interface Window {
    __miluju: {
      auditWordBreak(): AuditFinding[];
      auditTextOverflow(): AuditFinding[];
      auditFontStack(): AuditFinding[];
      auditContrast(): AuditFinding[];
      auditTouchTargets(): AuditFinding[];
    };
  }
}
