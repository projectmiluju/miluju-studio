/**
 * miluju-studio 한글 검수 헬퍼
 *
 * @playwright/mcp의 initScript로 모든 페이지에 주입됩니다.
 * window.__miluju 네임스페이스에 검수 유틸리티를 등록합니다.
 */

(() => {
  /** @typedef {{ selector: string, text: string, issue: string, computed: string }} AuditFinding */

  window.__miluju = {
    /**
     * 한글 텍스트가 포함된 요소에서 word-break 설정을 검사합니다.
     * 한글은 word-break: keep-all이 없으면 음절 단위로 줄바꿈되어 가독성이 떨어집니다.
     * @returns {AuditFinding[]}
     */
    auditWordBreak() {
      const findings = [];
      const koreanPattern = /[\uAC00-\uD7AF]/;
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      const checked = new Set();

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        if (!koreanPattern.test(textNode.textContent || "")) continue;

        const el = textNode.parentElement;
        if (!el || checked.has(el)) continue;
        checked.add(el);

        const style = getComputedStyle(el);
        const wordBreak = style.wordBreak;

        if (wordBreak !== "keep-all" && wordBreak !== "break-all") {
          findings.push({
            selector: cssPath(el),
            text: (textNode.textContent || "").slice(0, 40),
            issue: "한글 텍스트에 word-break: keep-all 미적용",
            computed: `word-break: ${wordBreak}`,
          });
        }
      }

      return findings;
    },

    /**
     * 한글 텍스트의 overflow 여부를 검사합니다.
     * 한글은 영문보다 글자 폭이 넓어 overflow가 발생하기 쉽습니다.
     * @returns {AuditFinding[]}
     */
    auditTextOverflow() {
      const findings = [];
      const koreanPattern = /[\uAC00-\uD7AF]/;
      const all = document.querySelectorAll("*");

      for (const el of all) {
        if (!koreanPattern.test(el.textContent || "")) continue;
        if (el.children.length > 0 && el.children.length === el.childNodes.length) continue;

        if (el.scrollWidth > el.clientWidth + 1) {
          findings.push({
            selector: cssPath(el),
            text: (el.textContent || "").slice(0, 40),
            issue: "한글 텍스트 가로 overflow 발생",
            computed: `scrollWidth(${el.scrollWidth}) > clientWidth(${el.clientWidth})`,
          });
        }

        if (el.scrollHeight > el.clientHeight + 1) {
          const style = getComputedStyle(el);
          const overflow = style.overflow || style.overflowY;
          if (overflow === "visible" || overflow === "auto" || overflow === "scroll") continue;
          if (style.maxHeight === "none" && style.height === "auto") continue;

          findings.push({
            selector: cssPath(el),
            text: (el.textContent || "").slice(0, 40),
            issue: "한글 텍스트 세로 overflow 발생",
            computed: `scrollHeight(${el.scrollHeight}) > clientHeight(${el.clientHeight})`,
          });
        }
      }

      return findings;
    },

    /**
     * 폰트 스택에서 한글 폰트 적용 여부를 검사합니다.
     * system-ui만 있으면 OS별로 한글 렌더링이 달라질 수 있습니다.
     * @returns {AuditFinding[]}
     */
    auditFontStack() {
      const findings = [];
      const koreanPattern = /[\uAC00-\uD7AF]/;
      const koreanFonts = [
        "pretendard", "noto sans kr", "noto sans korean",
        "spoqa han sans", "malgun gothic", "맑은 고딕",
        "apple sd gothic neo", "nanum", "나눔",
      ];

      const checked = new Set();
      const all = document.querySelectorAll("*");

      for (const el of all) {
        const text = el.textContent || "";
        if (!koreanPattern.test(text)) continue;
        if (el.children.length > 0 && el.children.length === el.childNodes.length) continue;

        const style = getComputedStyle(el);
        const fontFamily = style.fontFamily.toLowerCase();

        if (checked.has(fontFamily)) continue;
        checked.add(fontFamily);

        const hasKoreanFont = koreanFonts.some((f) => fontFamily.includes(f));
        if (!hasKoreanFont) {
          findings.push({
            selector: cssPath(el),
            text: text.slice(0, 40),
            issue: "한글 전용 폰트 미지정 (system-ui 의존)",
            computed: `font-family: ${style.fontFamily}`,
          });
        }
      }

      return findings;
    },

    /**
     * 색상 대비(contrast ratio)를 검사합니다.
     * WCAG AA 기준: 일반 텍스트 4.5:1, 큰 텍스트 3:1
     * @returns {AuditFinding[]}
     */
    auditContrast() {
      const findings = [];
      const all = document.querySelectorAll("*");

      for (const el of all) {
        if (!el.textContent?.trim()) continue;
        if (el.children.length > 0 && el.children.length === el.childNodes.length) continue;

        const style = getComputedStyle(el);
        const fg = parseColor(style.color);
        const bg = findBackgroundColor(el);

        if (!fg || !bg) continue;

        const ratio = contrastRatio(fg, bg);
        const fontSize = parseFloat(style.fontSize);
        const isBold = parseInt(style.fontWeight) >= 700;
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);
        const threshold = isLargeText ? 3 : 4.5;

        if (ratio < threshold) {
          findings.push({
            selector: cssPath(el),
            text: (el.textContent || "").slice(0, 40),
            issue: `색상 대비 부족 (${ratio.toFixed(2)}:1, 최소 ${threshold}:1 필요)`,
            computed: `color: ${style.color}, background: ${style.backgroundColor}`,
          });
        }
      }

      return findings;
    },

    /**
     * 터치 타겟 크기를 검사합니다.
     * WCAG 2.2 기준: 최소 24x24px, 권장 44x44px
     * @returns {AuditFinding[]}
     */
    auditTouchTargets() {
      const findings = [];
      const interactiveSelectors = "a, button, input, select, textarea, [role='button'], [onclick], [tabindex]";
      const elements = document.querySelectorAll(interactiveSelectors);

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        if (rect.width < 24 || rect.height < 24) {
          findings.push({
            selector: cssPath(el),
            text: (el.textContent || "").slice(0, 40),
            issue: `터치 타겟 너무 작음 (최소 24x24px)`,
            computed: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
          });
        }
      }

      return findings;
    },
  };

  // --- 헬퍼 함수 ---

  function cssPath(el) {
    const parts = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.id) {
        selector += `#${el.id}`;
        parts.unshift(selector);
        break;
      }
      if (el.className && typeof el.className === "string") {
        const cls = el.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (cls) selector += `.${cls}`;
      }
      parts.unshift(selector);
      el = el.parentElement;
    }
    return parts.join(" > ") || "body";
  }

  function parseColor(str) {
    const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    return [+match[1], +match[2], +match[3]];
  }

  function findBackgroundColor(el) {
    let current = el;
    while (current) {
      const bg = getComputedStyle(current).backgroundColor;
      const parsed = parseColor(bg);
      if (parsed && bg !== "rgba(0, 0, 0, 0)") return parsed;
      current = current.parentElement;
    }
    return [255, 255, 255]; // 기본: 흰색 배경
  }

  function luminance([r, g, b]) {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function contrastRatio(fg, bg) {
    const l1 = luminance(fg) + 0.05;
    const l2 = luminance(bg) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  }
})();
