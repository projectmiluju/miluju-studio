/**
 * LLM-as-a-Judge 코어
 *
 * Anthropic SDK를 사용하여 스킬 응답의 품질을 평가합니다.
 * 1. 스킬 마크다운 + 사용자 프롬프트 → LLM 응답 생성
 * 2. 응답 + 평가 기준 → judge LLM이 채점
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  EvalCase,
  EvalResult,
  CriterionScore,
  EvalConfig,
} from "./types.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * 스킬 프롬프트를 시스템 메시지로, 사용자 입력을 유저 메시지로 보내
 * LLM 응답을 생성합니다.
 */
export async function generateResponse(
  skillContent: string,
  userPrompt: string,
  model: string
): Promise<string> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: skillContent,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

/**
 * judge 프롬프트를 구성하여 응답을 채점합니다.
 * 반환값은 JSON 파싱된 점수 배열입니다.
 */
export async function judgeResponse(
  evalCase: EvalCase,
  response: string,
  model: string
): Promise<CriterionScore[]> {
  const anthropic = getClient();

  const criteriaList = evalCase.criteria
    .map(
      (c, i) =>
        `${i + 1}. **${c.name}** (가중치 ${c.weight}): ${c.description}`
    )
    .join("\n");

  const judgeSystemPrompt = `당신은 AI 스킬 응답의 품질을 평가하는 심사관입니다.
아래 평가 기준에 따라 응답을 1-5점으로 채점하세요.

점수 기준:
- 5: 탁월함 — 기준을 완벽히 충족하며 추가 가치를 제공
- 4: 우수함 — 기준을 충족하며 사소한 개선점만 존재
- 3: 적절함 — 기준을 대체로 충족하나 눈에 띄는 부족함이 있음
- 2: 부족함 — 기준을 부분적으로만 충족
- 1: 미달 — 기준에 크게 미달

반드시 아래 JSON 배열 형식으로만 응답하세요. 다른 텍스트를 포함하지 마세요.
[
  { "criterion": "기준명", "score": 점수, "reasoning": "판단 근거 (1-2문장)" }
]`;

  const judgeUserPrompt = `## 평가 대상 스킬
${evalCase.skill}

## 사용자 프롬프트
${evalCase.prompt}

## 평가 기준
${criteriaList}

## AI 응답
${response}

위 응답을 평가 기준에 따라 채점하세요. JSON 배열로만 응답하세요.`;

  const message = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system: judgeSystemPrompt,
    messages: [{ role: "user", content: judgeUserPrompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock?.text ?? "[]";

  // JSON 파싱 (코드블록 감싸기 처리)
  const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    return JSON.parse(jsonStr) as CriterionScore[];
  } catch {
    // 파싱 실패 시 기본 점수 반환
    return evalCase.criteria.map((c) => ({
      criterion: c.name,
      score: 0,
      reasoning: `채점 JSON 파싱 실패: ${raw.slice(0, 100)}`,
    }));
  }
}

/**
 * 키워드 검사를 수행합니다.
 */
function checkKeywords(
  response: string,
  required?: string[],
  forbidden?: string[]
): { keywordPass: boolean; forbiddenPass: boolean } {
  const lower = response.toLowerCase();

  const keywordPass = !required || required.every((kw) => lower.includes(kw.toLowerCase()));
  const forbiddenPass = !forbidden || forbidden.every((kw) => !lower.includes(kw.toLowerCase()));

  return { keywordPass, forbiddenPass };
}

/**
 * 가중 평균 점수를 계산합니다.
 */
function calculateWeightedScore(
  scores: CriterionScore[],
  criteria: { name: string; weight: number }[]
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const criterion of criteria) {
    const score = scores.find((s) => s.criterion === criterion.name);
    if (score && score.score > 0) {
      weightedSum += score.score * criterion.weight;
      totalWeight += criterion.weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * 단일 평가 케이스를 실행합니다.
 */
export async function runEvalCase(
  evalCase: EvalCase,
  skillContent: string,
  config: EvalConfig
): Promise<EvalResult> {
  const startTime = Date.now();

  // 1. 응답 생성
  const response = await generateResponse(
    skillContent,
    evalCase.prompt,
    config.model
  );

  // 2. judge 채점
  const scores = await judgeResponse(evalCase, response, config.model);

  // 3. 키워드 검사
  const { keywordPass, forbiddenPass } = checkKeywords(
    response,
    evalCase.requiredKeywords,
    evalCase.forbiddenKeywords
  );

  // 4. 가중 평균
  const weightedScore = calculateWeightedScore(scores, evalCase.criteria);

  const durationMs = Date.now() - startTime;

  return {
    caseId: evalCase.id,
    skill: evalCase.skill,
    response,
    scores,
    weightedScore,
    keywordPass,
    forbiddenPass,
    pass: weightedScore >= config.passThreshold && keywordPass && forbiddenPass,
    durationMs,
  };
}
