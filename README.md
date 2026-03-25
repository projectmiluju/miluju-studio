# miluju-studio

> 1인 개발자를 위한 AI 에이전트 워크플로우 인프라

혼자 만드는 프로젝트에서 AI 에이전트가 **설계부터 배포, 문서화까지** 일관된 품질로 작업할 수 있도록 지원하는 소프트웨어 인프라입니다.

## 이게 뭔가요?

AI 에이전트에게 "이렇게 일해"라고 알려주는 마크다운 스킬 파일 7개, 그리고 그 스킬이 제대로 동작하도록 뒷받침하는 도구 모음입니다.

**스킬 파이프라인:**

```
/spec → /ui → /build → /qa → /ship → /ops → /docs
 명세    화면    구현     검증    출시    운영    기록
```

**도구:**

| 명령어 | 하는 일 |
|--------|---------|
| `bun run gen` | 스킬 1벌 → 8개 에이전트용 자동 변환 (56파일) |
| `bun run browse` | 브라우저 MCP 서버 (한글 렌더링/접근성/디자인토큰 검수) |
| `bun run eval` | 스킬 변경 시 LLM으로 품질 회귀 테스트 |
| `bun run miluju doctor` | 환경 진단 |

## 왜 만들었나?

1. **마크다운만으로는 부족합니다.** 스킬 파일을 수정했는데 응답 품질이 떨어졌는지 알 방법이 없습니다. eval 시스템이 이걸 잡아줍니다.

2. **에이전트마다 포맷이 다릅니다.** Claude Code는 `/slash`, Cursor는 `@mention`, Codex는 `$skill`, Gemini는 파일 참조. 스킬을 한 번 쓰면 8개 에이전트용으로 자동 변환됩니다.

3. **한글 프로젝트는 영어권과 다릅니다.** `word-break: keep-all` 미적용, 한글 폰트 미지정, IME 입력 버그 — 이런 문제를 브라우저에서 직접 검수합니다.

## 내 프로젝트에 스킬 설치하기

```bash
# 1. miluju-studio 클론 & 준비
git clone <repo-url> miluju-studio
cd miluju-studio
./setup
bun run gen          # dist/skills/ 에 56개 파일 생성

# 2. 다른 프로젝트에 스킬 설치
bun run miluju install --agent claude-code --target ~/my-project

# Cursor + Windsurf 동시 설치
bun run miluju install --agent cursor --agent windsurf --target ~/my-project

# 모든 에이전트용 스킬 한 번에 설치
bun run miluju install --target ~/my-project
```

**지원 에이전트 (8종):**

| 에이전트 | 호출 방식 | 설치 경로 |
|----------|-----------|-----------|
| Claude Code | `/spec`, `/ui` ... | `.claude/commands/` |
| Cursor | `@spec`, `@ui` ... | `.cursor/rules/` |
| Windsurf | `@spec`, `@ui` ... | `.windsurf/rules/` |
| Gemini CLI | 파일 참조 | `skills/` |
| OpenAI Codex | `$spec`, `$ui` ... | `.codex/skills/` |
| GitHub Copilot | 자동 주입 | `.github/instructions/` |
| Antigravity | 시맨틱 매칭 | `.agent/skills/` |
| AWS Kiro | `#spec`, `#ui` ... | `.kiro/steering/` |

## 개발자용 빠른 시작

miluju-studio 자체를 개발/커스터마이징하려면:

```bash
# 설치
./setup

# 스킬 문서 생성 (8 에이전트 × 7 스킬 = 56파일)
bun run gen

# 환경 점검
bun run miluju doctor

# 스킬 품질 평가 (ANTHROPIC_API_KEY 필요)
bun run eval

# 브라우저 검수 서버
bun run browse
```

## 스킬 7종

| 스킬 | 역할 | 핵심 기능 |
|------|------|-----------|
| **spec** | 명세 | PRD 작성, 사고 방지 체크리스트, 6단계 진단 |
| **ui** | 화면 | 디자인 시스템, Stitch 프로토타입, 한글 타이포그래피 |
| **build** | 구현 | 7가지 안티패턴 차단, 한글 문자열 중앙화, 타입 안전 |
| **qa** | 검증 | 테스트 시나리오 매트릭스, IME 입력 테스트, 버그 리포트 |
| **ship** | 출시 | 커밋 위생, SemVer 자동화, 한글 CHANGELOG |
| **ops** | 운영 | 인프라 3-tier 선택, CI/CD, UTF-8 로그 검증 |
| **docs** | 기록 | Dev Log, ADR, README 동기화, STATUS.md |

모든 스킬은 `_base.md`의 공통 원칙(1인 개발자 5원칙, 안티-아첨, 한글 프로젝트 지침)을 공유합니다.

## 프로젝트 구조

```
miluju-studio/
├── skills/                    ← 7 스킬 + 공통 기반
│   ├── _base.md               ← 공통 원칙
│   ├── spec.md ~ docs.md      ← 7개 스킬
│
├── src/                       ← 스킬 생성기
│   ├── gen-skill-docs.ts      ← CLI 진입점
│   └── lib/                   ← 파서, 변환기, 출력기
│
├── browse/                    ← MCP 브라우저 서버
│   ├── server.ts              ← MCP 진입점 (stdio/SSE)
│   ├── init-scripts/          ← 페이지 주입 검수 스크립트
│   └── tools/                 ← 한글/접근성/디자인토큰 검수
│
├── test/                      ← LLM-as-a-judge 평가
│   ├── eval.ts                ← CLI 진입점
│   ├── lib/                   ← judge 코어, 러너
│   └── cases/                 ← 스킬별 평가 케이스 (9개)
│
├── bin/                       ← CLI 유틸리티
│   ├── miluju.ts              ← 서브커맨드 라우터
│   └── commands/              ← install, doctor, update-check
│
├── setup                      ← 원클릭 설치
├── package.json
└── tsconfig.json
```

## 설계 원칙

1. **MCP 표준 채택**: 자체 통신 프로토콜 대신 Model Context Protocol을 사용하여 어떤 에이전트든 연결 가능.
2. **느리지만 단단하게**: "빨리 부수고 고치기"보다, 설계와 문서를 챙겨 혼자서도 안심하고 나아가는 워크플로우.
3. **한글 네이티브**: 커밋 메시지, 테스트 이름, CHANGELOG 섹션명까지 한국어. 한글 렌더링 검수 도구 내장.
