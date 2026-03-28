# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 따르며, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [Unreleased]

## [0.1.0] - 2026-03-29

### Added

- **CLI `miluju install`**: 8개 에이전트용 스킬 설치, MCP 브라우저 검수 서버 설정, GitHub Issue 템플릿 4종 및 PR 템플릿(`Closes #` 포함) 자동 설치. `--no-issue-templates`로 템플릿 생략 가능.
- **CLI `miluju update-check` / `miluju update`**: 스킬 frontmatter `version`과 `.milurc.json` 설치 레코드를 기준으로 업데이트 여부 확인 및 선택적 재설치. 로컬 `dist/skills`가 없으면 GitHub Releases API와 Raw URL로 최신 버전 조회·다운로드.
- **`bin/lib/registry.ts`**: `projectmiluju/miluju-studio` 저장소 기준 Releases API 및 Raw fetch 유틸.
- **스킬 버전 필드**: `skills/*.md` 및 `_base.md` frontmatter에 `version` 태그. `src/lib/parser.ts`에서 파싱.
- **`_base.md` 브랜치 보호 규칙**: `main`에 직접 commit/push 금지, feature/hotfix 브랜치 및 PR 흐름 명시.
- **`src/issue-templates/`**: bug_report, feature_request, task, question, config.yml, pull_request_template.
- **GitHub Actions `release.yml`**: `v*.*.*` 태그 push 시 GitHub Release 자동 생성.
- **`dist/skills/`**: GitHub Raw 릴리즈 및 `npx` 설치 경로용으로 저장소에 포함.

### Changed

- **npm 패키지 메타데이터**: `files`, `repository`, `prepublishOnly`(gen + build:browse-node + typecheck).
- **README**: 설치·업데이트·GitHub 템플릿 안내 보강.

### Fixed

- Codex 스킬 설치 경로를 `.agents/skills`로 정정(이전 커밋 기준).
