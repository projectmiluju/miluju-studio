/**
 * spec 스킬 평가 케이스
 */

import type { EvalCase } from "../lib/types.js";
import { COMMON_CRITERIA } from "../lib/types.js";

export const specCases: EvalCase[] = [
  {
    id: "spec-prd-basic",
    skill: "spec",
    prompt:
      "블로그 플랫폼을 만들려고 해. 마크다운 에디터, 태그 시스템, RSS 피드가 필요해. PRD를 작성해줘.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "사고 방지 규칙 준수",
        description: "추정 기반 결정을 피하고, 근거 기반으로 판단하는가? 확인 질문이 포함되는가?",
        weight: 4,
      },
    ],
    requiredKeywords: ["마크다운", "태그", "RSS"],
    forbiddenKeywords: ["amazing", "great choice", "excellent"],
  },
  {
    id: "spec-diagnosis",
    skill: "spec",
    prompt:
      "Next.js 앱에서 빌드 시간이 3분에서 8분으로 늘었어. 새로 추가한 건 이미지 최적화 라이브러리야. 진단해줘.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "6단계 진단 워크플로우",
        description: "증상 수집 → 가설 생성 → 검증 계획 순서를 따르는가?",
        weight: 5,
      },
    ],
    requiredKeywords: ["빌드", "이미지"],
  },
  {
    id: "spec-korean-market",
    skill: "spec",
    prompt:
      "소셜 로그인을 구현하려고 해. 어떤 제공자를 지원해야 할까?",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "한국 시장 고려",
        description: "카카오, 네이버 등 한국 생태계를 우선 고려하는가?",
        weight: 5,
      },
    ],
    requiredKeywords: ["카카오"],
  },
];
