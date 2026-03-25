/**
 * ui 스킬 평가 케이스
 */

import type { EvalCase } from "../lib/types.js";
import { COMMON_CRITERIA } from "../lib/types.js";

export const uiCases: EvalCase[] = [
  {
    id: "ui-system-basic",
    skill: "ui",
    prompt:
      "SaaS 대시보드를 만들려고 해. 디자인 시스템 기초를 잡아줘. 색상 팔레트, 타이포그래피, 간격 시스템이 필요해.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "디자인 토큰 구체성",
        description: "CSS 변수명, 실제 값(색상코드, px 값 등)이 명시되는가?",
        weight: 5,
      },
      {
        name: "한글 타이포그래피",
        description: "한글 폰트 페어링(Pretendard 등), word-break: keep-all 등 한글 특수 고려가 포함되는가?",
        weight: 4,
      },
    ],
    requiredKeywords: ["토큰", "간격"],
  },
  {
    id: "ui-component-spec",
    skill: "ui",
    prompt:
      "모달 다이얼로그 컴포넌트 명세서를 작성해줘. 확인/취소 버튼, 배경 오버레이, ESC 키 닫기가 필요해.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "컴포넌트 명세 완전성",
        description: "Props, 상태, 접근성(ARIA), 키보드 인터랙션이 모두 포함되는가?",
        weight: 5,
      },
    ],
    requiredKeywords: ["aria", "ESC"],
    forbiddenKeywords: ["amazing design"],
  },
];
