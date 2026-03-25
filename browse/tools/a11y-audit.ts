/**
 * 접근성(Accessibility) 검수 MCP 도구
 *
 * WCAG 2.2 기준으로 웹페이지의 접근성을 검사합니다.
 * - 색상 대비 (AA 기준: 4.5:1 / 큰 텍스트 3:1)
 * - 터치 타겟 크기 (최소 24x24px)
 * - ARIA 라벨 누락
 * - 이미지 alt 텍스트 누락
 */

import type { Page } from "playwright";
import type { AuditFinding } from "./korean-audit.js";

/** 접근성 검수 결과 */
export interface A11yAuditResult {
  url: string;
  timestamp: string;
  contrast: AuditFinding[];
  touchTargets: AuditFinding[];
  missingAlt: AuditFinding[];
  missingLabel: AuditFinding[];
  summary: {
    total: number;
    critical: number;
    warning: number;
  };
}

/**
 * 접근성 검수를 수행합니다.
 */
export async function runA11yAudit(page: Page): Promise<A11yAuditResult> {
  const [contrast, touchTargets, missingAlt, missingLabel] = await Promise.all([
    page.evaluate(() => window.__miluju.auditContrast()),
    page.evaluate(() => window.__miluju.auditTouchTargets()),
    // alt 텍스트 검사는 별도 evaluate
    page.evaluate(() => {
      const findings: { selector: string; text: string; issue: string; computed: string }[] = [];
      const images = document.querySelectorAll("img");
      for (const img of images) {
        if (!img.alt && !img.getAttribute("aria-label") && !img.getAttribute("aria-hidden")) {
          findings.push({
            selector: img.src ? `img[src="${img.src.slice(-50)}"]` : "img",
            text: img.src?.split("/").pop()?.slice(0, 40) || "(no src)",
            issue: "이미지에 alt 텍스트 누락",
            computed: `src: ${img.src?.slice(0, 60) || "none"}`,
          });
        }
      }
      return findings;
    }),
    // ARIA 라벨 검사
    page.evaluate(() => {
      const findings: { selector: string; text: string; issue: string; computed: string }[] = [];
      const interactives = document.querySelectorAll(
        "button, input, select, textarea, [role='button'], [role='link']"
      );
      for (const el of interactives) {
        const hasLabel =
          el.getAttribute("aria-label") ||
          el.getAttribute("aria-labelledby") ||
          el.textContent?.trim() ||
          (el instanceof HTMLInputElement && el.placeholder) ||
          document.querySelector(`label[for="${el.id}"]`);

        if (!hasLabel) {
          findings.push({
            selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ""),
            text: "(접근 가능한 이름 없음)",
            issue: "인터랙티브 요소에 접근 가능한 이름 누락",
            computed: `tag: ${el.tagName}, role: ${el.getAttribute("role") || "default"}`,
          });
        }
      }
      return findings;
    }),
  ]);

  const critical = contrast.length + missingLabel.length;
  const warning = touchTargets.length + missingAlt.length;

  return {
    url: page.url(),
    timestamp: new Date().toISOString(),
    contrast,
    touchTargets,
    missingAlt,
    missingLabel,
    summary: {
      total: critical + warning,
      critical,
      warning,
    },
  };
}

/**
 * 접근성 검수 결과를 마크다운 리포트로 변환합니다.
 */
export function formatA11yAuditReport(result: A11yAuditResult): string {
  const lines: string[] = [
    `# 접근성(A11y) 검수 리포트`,
    ``,
    `- **URL**: ${result.url}`,
    `- **검사 시각**: ${result.timestamp}`,
    `- **발견 항목**: ${result.summary.total}건 (심각 ${result.summary.critical}, 주의 ${result.summary.warning})`,
    ``,
  ];

  if (result.summary.total === 0) {
    lines.push(`✅ 접근성 이상 없음 (WCAG AA 기준)`);
    return lines.join("\n");
  }

  if (result.contrast.length > 0) {
    lines.push(`## 🔴 색상 대비 부족 (${result.contrast.length}건)`);
    lines.push(``);
    for (const f of result.contrast) {
      lines.push(`- \`${f.selector}\`: ${f.issue}`);
      lines.push(`  - ${f.computed}`);
    }
    lines.push(``);
  }

  if (result.missingLabel.length > 0) {
    lines.push(`## 🔴 접근 가능한 이름 누락 (${result.missingLabel.length}건)`);
    lines.push(``);
    for (const f of result.missingLabel) {
      lines.push(`- \`${f.selector}\`: ${f.issue}`);
      lines.push(`  - ${f.computed}`);
    }
    lines.push(``);
  }

  if (result.touchTargets.length > 0) {
    lines.push(`## 🟡 터치 타겟 크기 부족 (${result.touchTargets.length}건)`);
    lines.push(``);
    for (const f of result.touchTargets) {
      lines.push(`- \`${f.selector}\`: 현재 ${f.computed} (최소 24x24px)`);
    }
    lines.push(``);
  }

  if (result.missingAlt.length > 0) {
    lines.push(`## 🟡 이미지 alt 텍스트 누락 (${result.missingAlt.length}건)`);
    lines.push(``);
    for (const f of result.missingAlt) {
      lines.push(`- \`${f.selector}\``);
      lines.push(`  - ${f.computed}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
