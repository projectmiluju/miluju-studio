/**
 * qa 스킬 평가 케이스
 */

import type { EvalCase } from "../lib/types.js";
import { COMMON_CRITERIA } from "../lib/types.js";

export const qaCases: EvalCase[] = [
  {
    id: "qa-unit-test",
    skill: "qa",
    prompt:
      "이메일 유효성 검증 함수의 단위 테스트를 작성해줘. 한글 이름이 포함된 이메일도 고려해야 해.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "AAA 패턴",
        description: "Arrange-Act-Assert 패턴을 따르는가?",
        weight: 4,
      },
      {
        name: "한글 IME 테스트",
        description: "한글 입력 관련 엣지 케이스(조합 중 상태, UTF-8 등)를 고려하는가?",
        weight: 4,
      },
    ],
    requiredKeywords: ["test", "expect"],
  },
  {
    id: "qa-e2e-scenario",
    skill: "qa",
    prompt:
      "회원가입 → 로그인 → 프로필 수정 E2E 테스트 시나리오를 작성해줘.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "시나리오 완전성",
        description: "Happy path뿐 아니라 실패 케이스(잘못된 비밀번호 등)도 포함하는가?",
        weight: 4,
      },
    ],
    requiredKeywords: ["회원가입", "로그인"],
  },
];
