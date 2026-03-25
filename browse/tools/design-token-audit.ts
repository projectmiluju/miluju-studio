/**
 * 디자인 토큰 검증 MCP 도구
 *
 * 페이지에 사용된 CSS 값이 디자인 시스템의 토큰과 일치하는지 검사합니다.
 * - 색상: 하드코딩된 색상값 대신 CSS 변수 사용 여부
 * - 간격: 임의 px 값 대신 spacing 시스템 사용 여부
 * - 타이포그래피: font-size/line-height/font-weight 일관성
 */

import type { Page } from "playwright";

/** 디자인 토큰 위반 항목 */
export interface TokenViolation {
  selector: string;
  property: string;
  value: string;
  issue: string;
  suggestion?: string;
}

/** 디자인 토큰 검수 결과 */
export interface DesignTokenAuditResult {
  url: string;
  timestamp: string;
  hardcodedColors: TokenViolation[];
  inconsistentSpacing: TokenViolation[];
  typographyIssues: TokenViolation[];
  cssVariables: { name: string; value: string }[];
  summary: {
    total: number;
    tokensFound: number;
    violations: number;
  };
}

/**
 * 디자인 토큰 검수를 수행합니다.
 */
export async function runDesignTokenAudit(page: Page): Promise<DesignTokenAuditResult> {
  const result = await page.evaluate(() => {
    type Violation = {
      selector: string;
      property: string;
      value: string;
      issue: string;
      suggestion?: string;
    };

    // 1. CSS 커스텀 속성(토큰) 수집
    const cssVariables: { name: string; value: string }[] = [];
    const rootStyle = getComputedStyle(document.documentElement);

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ":root") {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith("--")) {
                cssVariables.push({
                  name: prop,
                  value: rootStyle.getPropertyValue(prop).trim(),
                });
              }
            }
          }
        }
      } catch {
        // CORS로 접근 불가한 외부 스타일시트 무시
      }
    }

    // 2. 하드코딩된 색상 검사
    const hardcodedColors: Violation[] = [];
    const colorProps = ["color", "background-color", "border-color"];
    const hexPattern = /#[0-9a-fA-F]{3,8}/;
    const rgbPattern = /rgb\(\s*\d+/;

    const allElements = document.querySelectorAll("*");
    const colorChecked = new Map<string, boolean>();

    for (const el of allElements) {
      const style = getComputedStyle(el);
      for (const prop of colorProps) {
        const value = style.getPropertyValue(prop);
        if (!value || value === "rgba(0, 0, 0, 0)") continue;

        // 인라인 스타일에 하드코딩된 색상이 있는지 확인
        const inlineStyle = (el as HTMLElement).style;
        const inlineValue = inlineStyle.getPropertyValue(prop);

        if (inlineValue && (hexPattern.test(inlineValue) || rgbPattern.test(inlineValue))) {
          const key = `${prop}:${inlineValue}`;
          if (colorChecked.has(key)) continue;
          colorChecked.set(key, true);

          hardcodedColors.push({
            selector: cssPathSimple(el),
            property: prop,
            value: inlineValue,
            issue: "인라인 스타일에 하드코딩된 색상값",
            suggestion: "CSS 변수(디자인 토큰)를 사용하세요",
          });
        }
      }
    }

    // 3. 비일관적 간격 검사 (4px 단위가 아닌 값)
    const inconsistentSpacing: Violation[] = [];
    const spacingProps = ["padding", "margin", "gap"];
    const spacingChecked = new Set<string>();

    for (const el of allElements) {
      const inlineStyle = (el as HTMLElement).style;
      for (const prop of spacingProps) {
        const value = inlineStyle.getPropertyValue(prop);
        if (!value) continue;

        const pxValues = value.match(/(\d+)px/g);
        if (!pxValues) continue;

        for (const pxVal of pxValues) {
          const num = parseInt(pxVal);
          if (num === 0) continue;
          if (num % 4 !== 0) {
            const key = `${prop}:${pxVal}`;
            if (spacingChecked.has(key)) continue;
            spacingChecked.add(key);

            const nearest = Math.round(num / 4) * 4;
            inconsistentSpacing.push({
              selector: cssPathSimple(el),
              property: prop,
              value: pxVal,
              issue: `4px 그리드에 맞지 않는 간격값`,
              suggestion: `${nearest}px (가장 가까운 4px 배수)`,
            });
          }
        }
      }
    }

    // 4. 타이포그래피 일관성 검사
    const typographyIssues: Violation[] = [];
    const fontSizes = new Map<string, number>();

    for (const el of allElements) {
      if (!el.textContent?.trim()) continue;
      if (el.children.length > 0 && el.children.length === el.childNodes.length) continue;

      const style = getComputedStyle(el);
      const fontSize = style.fontSize;
      fontSizes.set(fontSize, (fontSizes.get(fontSize) || 0) + 1);
    }

    // 너무 많은 폰트 크기 사용 시 경고
    if (fontSizes.size > 8) {
      typographyIssues.push({
        selector: ":root",
        property: "font-size",
        value: `${fontSizes.size}종류 사용 중`,
        issue: `타이포그래피 스케일이 너무 많음 (${fontSizes.size}종류, 권장 6-8종류)`,
        suggestion: "타이포그래피 스케일을 정리하세요 (예: 12/14/16/18/20/24/32/40px)",
      });
    }

    function cssPathSimple(el: Element): string {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const cls = el.className && typeof el.className === "string"
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
      return `${tag}${cls}`;
    }

    return {
      hardcodedColors,
      inconsistentSpacing,
      typographyIssues,
      cssVariables,
    };
  });

  const violations =
    result.hardcodedColors.length +
    result.inconsistentSpacing.length +
    result.typographyIssues.length;

  return {
    url: page.url(),
    timestamp: new Date().toISOString(),
    ...result,
    summary: {
      total: violations + result.cssVariables.length,
      tokensFound: result.cssVariables.length,
      violations,
    },
  };
}

/**
 * 디자인 토큰 검수 결과를 마크다운 리포트로 변환합니다.
 */
export function formatDesignTokenReport(result: DesignTokenAuditResult): string {
  const lines: string[] = [
    `# 디자인 토큰 검수 리포트`,
    ``,
    `- **URL**: ${result.url}`,
    `- **검사 시각**: ${result.timestamp}`,
    `- **CSS 변수(토큰)**: ${result.summary.tokensFound}개 발견`,
    `- **위반 항목**: ${result.summary.violations}건`,
    ``,
  ];

  if (result.cssVariables.length > 0) {
    lines.push(`## 📐 감지된 디자인 토큰`);
    lines.push(``);
    for (const v of result.cssVariables.slice(0, 20)) {
      lines.push(`- \`${v.name}\`: ${v.value}`);
    }
    if (result.cssVariables.length > 20) {
      lines.push(`- ... 외 ${result.cssVariables.length - 20}개`);
    }
    lines.push(``);
  }

  if (result.summary.violations === 0) {
    lines.push(`✅ 디자인 토큰 위반 없음`);
    return lines.join("\n");
  }

  if (result.hardcodedColors.length > 0) {
    lines.push(`## 🔴 하드코딩된 색상 (${result.hardcodedColors.length}건)`);
    lines.push(``);
    for (const v of result.hardcodedColors) {
      lines.push(`- \`${v.selector}\` → \`${v.property}: ${v.value}\``);
      if (v.suggestion) lines.push(`  - 💡 ${v.suggestion}`);
    }
    lines.push(``);
  }

  if (result.inconsistentSpacing.length > 0) {
    lines.push(`## 🟡 비일관적 간격 (${result.inconsistentSpacing.length}건)`);
    lines.push(``);
    for (const v of result.inconsistentSpacing) {
      lines.push(`- \`${v.selector}\` → \`${v.property}: ${v.value}\``);
      if (v.suggestion) lines.push(`  - 💡 권장: ${v.suggestion}`);
    }
    lines.push(``);
  }

  if (result.typographyIssues.length > 0) {
    lines.push(`## 🟡 타이포그래피 이슈 (${result.typographyIssues.length}건)`);
    lines.push(``);
    for (const v of result.typographyIssues) {
      lines.push(`- ${v.issue}`);
      if (v.suggestion) lines.push(`  - 💡 ${v.suggestion}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
