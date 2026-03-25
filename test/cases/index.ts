/**
 * 전체 평가 케이스 인덱스
 */

import { specCases } from "./spec.eval.js";
import { uiCases } from "./ui.eval.js";
import { buildCases } from "./build.eval.js";
import { qaCases } from "./qa.eval.js";
import type { EvalCase } from "../lib/types.js";

export const ALL_EVAL_CASES: EvalCase[] = [
  ...specCases,
  ...uiCases,
  ...buildCases,
  ...qaCases,
];
