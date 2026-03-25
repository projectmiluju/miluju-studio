/**
 * build 스킬 평가 케이스
 */

import type { EvalCase } from "../lib/types.js";
import { COMMON_CRITERIA } from "../lib/types.js";

export const buildCases: EvalCase[] = [
  {
    id: "build-api-implementation",
    skill: "build",
    prompt:
      "REST API로 게시글 CRUD를 구현해줘. Next.js App Router + Prisma를 사용해. 페이지네이션과 검색도 필요해.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "안티패턴 회피",
        description: "any 타입, console.log 디버깅, 하드코딩된 문자열 등 안티패턴이 없는가?",
        weight: 5,
      },
      {
        name: "한글 문자열 중앙화",
        description: "한글 문자열이 코드에 산재하지 않고 상수/i18n 파일로 분리되는가?",
        weight: 3,
      },
    ],
    requiredKeywords: ["prisma", "pagination"],
    forbiddenKeywords: ["any", "console.log"],
  },
  {
    id: "build-auth-flow",
    skill: "build",
    prompt:
      "NextAuth.js로 카카오 소셜 로그인을 구현해줘. 세션 관리와 미들웨어 보호 라우트도 포함해.",
    criteria: [
      ...COMMON_CRITERIA,
      {
        name: "보안 고려",
        description: "CSRF, 세션 관리, 환경 변수 사용 등 보안 사항을 다루는가?",
        weight: 4,
      },
    ],
    requiredKeywords: ["카카오", "세션"],
  },
];
