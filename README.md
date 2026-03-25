# miluju-studio 🚀

> 1인 개발자를 위한 AI 에이전트 워크플로우 운영체제(OS)

단순한 프롬프트 모음을 넘어, AI 에이전트(Claude Code, Cursor 등)가 실제 브라우저를 조작하고, 스킬 품질을 보장하며, 팀처럼 협업할 수 있도록 지원하는 **솔로 개발자 특화 인프라**입니다.

## 🌟 `miluju-studio`가 해결하는 문제

마크다운 파일만 있는 기존의 AI 스킬 한계를 극복하기 위해, **소프트웨어 인프라**를 바탕으로 동작합니다:
- **실제 브라우저 조작**: 텍스트 상상망으로 디자인이나 QA를 처리하는 것을 넘어, Playwright MCP 기반 브라우저 데몬으로 눈으로 직접 확인하는 AI 에이전트를 구축합니다.
- **에이전트 비종속 파싱**: 하나의 스킬 포맷을 작성하면, Claude Code, Cursor, Gemini 등 각 에이전트의 포맷에 맞게 자동으로 문서를 변환합니다.
- **품질 유지 보수망 (Eval)**: 스킬(마크다운 프롬프트) 구조가 변경되었을 때, 응답의 품질이 유지되는지 LLM으로 직접 회귀 테스트를 수행합니다.

`gstack`에서 영감을 받았으나, 복잡한 자체 통신 데몬을 피하고 현대 표준인 **MCP(Model Context Protocol)**를 채택하여 훨씬 가볍고 에이전트 친화적인 워크플로우를 구성합니다.

---

## 🏗 아키텍처 및 구현 계획

이 프로젝트는 다음 순서대로 인프라를 구축할 계획입니다.

### Phase 1: 기반 설정 (Foundation) ✅
- **목표**: Bun 기반의 컴파일 가능한 TypeScript 환경 및 기본 설정 스크립트 구축.
- **주요 작업**:
  - `package.json` (+ `typescript`, `@playwright/mcp` 등 의존성) 세팅. ✅
  - 사용자 환경에 단일 명령어로 설치가 가능한 `setup` 쉘 스크립트 작성. ✅

### Phase 2: 스킬 생성기 (Skill Generator) ✅
- **목표**: 일관된 스킬 생태계를 위한 변환/파싱 파이프라인.
- **주요 작업 (`src/gen-skill-docs.ts`)**:
  - `_base.md` + 스킬 마크다운을 파싱하여 병합. ✅
  - 에이전트별 변환 (Claude Code: `/slash`, Cursor: `@mention`, Gemini: 파일 참조). ✅
  - `bun run gen` → `dist/skills/{agent}/{skill}.md` (3 에이전트 × 7 스킬 = 21개 파일). ✅

### Phase 3: MCP 브라우저 래퍼 (Browser Daemon) - 핵심✨
- **목표**: 브라우저 기반의 E2E 테스트(`tester.md`), 디자인 검수(`designer.md`), 상태 유지 자동화를 가능하게 하는 도구.
- **주요 작업 (`browse/`)**:
  - `@playwright/mcp` 위를 덮는 경량 래퍼 개발.
  - 1인 개발자의 한글 텍스트 렌더링 검수, 접근성 체크, 디자인 토큰 적용 확인 등 **miluju 만의 특수 기능** 추가.
  - 쿠키와 세션을 유지하는 지속적 브라우저 상태 관리 로직.

### Phase 4: 평가 시스템 (Eval Testing System)
- **목표**: 스킬(프롬프트)에 파괴적인 변경이 일어났을 때, 품질 저하를 사전 감지.
- **주요 작업 (`test/`)**:
  - LLM-as-a-judge 모델을 도입.
  - 주요 스킬(`planner.md`, `devops.md` 등)의 응답 명확성, 완전성, 포맷 준수 여부를 테스트하는 자동화 파이프라인.

### Phase 5: 유틸리티 CLI 도구 모음 (Utility CLI)
- **목표**: 개발 워크플로우를 매끄럽게 하는 보조 유틸리티.
- **주요 작업 (`bin/`)**:
  - 스킬/프레임워크 버전 검사 및 업데이트 알림 (`miluju-update-check`).
  - 현재 저장소 설정 초기화 및 텔레메트리(`analytics.ts`) 설정 (Opt-in).

---

## 📂 저장소 구조 (디렉토리 맵)

```
miluju-studio/
├── skills/                    ← 7가지 핵심 AI 에이전트 스킬 + 공통 기반 (완료✅)
│   ├── _base.md               ← 공통 원칙 (1인 개발자 철학, 안티-아첨, 한글 지침 등)
│   ├── planner.md
│   ├── designer.md
│   ├── fullstack.md
│   ├── tester.md
│   ├── releaser.md
│   ├── devops.md
│   └── scribe.md
│
├── src/                       ← TypeScript 소스코드 (완료✅)
│   └── index.ts               ← 프로젝트 진입점
│
├── browse/                    ← (예정) MCP 브라우저 데몬 및 래퍼 소스코드
├── scripts/                   ← (예정) 스킬 생성 파서 및 빌드 스크립트
├── bin/                       ← (예정) 커맨드라인 유틸리티 모음
├── test/                      ← (예정) 스킬 자동 평가(Evals) 테스트
├── setup                      ← 원클릭 환경 설치 쉘 스크립트 (완료✅)
├── package.json               ← Bun 프로젝트 패키지 설정 (완료✅)
└── tsconfig.json              ← TypeScript 설정 (완료✅)
```

---

## 💡 차별화 설계 철학 (vs gstack)

1. **에이전트 호환성 열어두기**: 자체 구현 서버보다, 표준 `MCP` 프로토콜을 적극 활용해 미래 기술 변화를 흡수.
2. **"솔로" 맞춤형**: 대규모 팀이나 YC의 'Ship fast, break things'보다, 부채를 관리하고 설계와 문서를 챙겨 혼자서 안심하고 나아가는 '느리지만 단단한' 1인 워크플로우를 지지.
3. **한글 텍스트 & 레이아웃 특수 대응**: 영어권과 다른 한글 문자 길이, 단어 끊김 현상 등 K-개발 환경의 어려움을 해소.
