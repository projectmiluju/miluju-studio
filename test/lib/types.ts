/**
 * miluju-studio 평가 시스템 타입 정의
 *
 * LLM-as-a-judge 기반의 스킬 품질 평가를 위한 핵심 타입들.
 */

/** 평가 기준 (rubric) */
export interface EvalCriterion {
  /** 기준 이름 (예: "명확성", "완전성") */
  name: string;
  /** 기준 설명 — LLM judge에게 전달됨 */
  description: string;
  /** 가중치 (1-5, 기본 3) */
  weight: number;
}

/** 개별 평가 케이스 */
export interface EvalCase {
  /** 케이스 ID (예: "spec-prd-basic") */
  id: string;
  /** 대상 스킬 이름 */
  skill: string;
  /** 사용자 프롬프트 (스킬에 보낼 입력) */
  prompt: string;
  /** 평가 기준 목록 */
  criteria: EvalCriterion[];
  /** 기대 출력의 필수 포함 키워드 (간이 검사용) */
  requiredKeywords?: string[];
  /** 기대하지 않는 출력 키워드 (안티패턴 검사용) */
  forbiddenKeywords?: string[];
}

/** LLM judge의 개별 기준 점수 */
export interface CriterionScore {
  criterion: string;
  score: number;       // 1-5
  reasoning: string;   // judge의 판단 근거
}

/** 단일 케이스 평가 결과 */
export interface EvalResult {
  caseId: string;
  skill: string;
  /** LLM이 생성한 응답 */
  response: string;
  /** 각 기준별 점수 */
  scores: CriterionScore[];
  /** 가중 평균 점수 (1-5) */
  weightedScore: number;
  /** 키워드 검사 통과 여부 */
  keywordPass: boolean;
  /** 금지 키워드 검사 통과 여부 */
  forbiddenPass: boolean;
  /** 전체 통과 여부 (가중 평균 ≥ 3.0 && 키워드 통과) */
  pass: boolean;
  /** 실행 시간 (ms) */
  durationMs: number;
}

/** 전체 평가 실행 결과 */
export interface EvalRunSummary {
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  averageScore: number;
  results: EvalResult[];
  /** 실행에 사용된 모델 */
  model: string;
  /** 총 실행 시간 (ms) */
  totalDurationMs: number;
}

/** 평가 설정 */
export interface EvalConfig {
  /** Anthropic API 모델 ID (기본: claude-sonnet-4-6) */
  model: string;
  /** 동시 실행 수 (기본: 3) */
  concurrency: number;
  /** 통과 기준 점수 (기본: 3.0) */
  passThreshold: number;
  /** 특정 스킬만 평가 (비어있으면 전체) */
  skillFilter: string[];
}

export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  model: "claude-sonnet-4-6",
  concurrency: 3,
  passThreshold: 3.0,
  skillFilter: [],
};

/** 공통 평가 기준 (모든 스킬에 적용) */
export const COMMON_CRITERIA: EvalCriterion[] = [
  {
    name: "명확성",
    description: "응답이 모호하지 않고 구체적이며, 1인 개발자가 바로 실행에 옮길 수 있는가?",
    weight: 4,
  },
  {
    name: "완전성",
    description: "요청된 항목을 빠짐없이 다루었는가? 핵심 섹션이 누락되지 않았는가?",
    weight: 4,
  },
  {
    name: "포맷 준수",
    description: "스킬에서 정의한 출력 포맷(마크다운 구조, 체크리스트, 코드블록 등)을 따르는가?",
    weight: 3,
  },
  {
    name: "한글 품질",
    description: "자연스러운 한국어를 사용하는가? 불필요한 영어 혼용, 어색한 번역투가 없는가?",
    weight: 3,
  },
  {
    name: "안티-아첨",
    description: "불필요한 칭찬이나 과도한 긍정 표현 없이, 직접적이고 실용적인 답변인가?",
    weight: 2,
  },
];
