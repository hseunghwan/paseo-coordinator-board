# AGENTS.md

Paseo 세션을 프로젝트별로 모으고 사람이 내릴 결정을 한곳에 올리는 Paseo 플러그인이다. 사용자 안내는 `README.md`(한국어)와 `OVERVIEW.md`(영어), 검증·릴리스 절차는 `CONTRIBUTING.md`가 정본이다. 이 파일은 그 문서에 없는 에이전트용 규칙만 담는다.

Tech Stack: TypeScript, React 19 + React Native 0.81(클라이언트), Node(플러그인 서버), `@getpaseo/plugin` 0.16.2, zod 4, Bun 1.4.0(테스트 실행기), Node 24.

## Operational Commands

- 의존성: `npm ci`. 잠금 파일은 `package-lock.json` 하나다. `bun install`, `yarn`, `pnpm`으로 잠금 파일을 만들거나 바꾸지 않는다.
- 타입 검사: `npm run typecheck`
- 전체 테스트: `npm test` (`bun test ./test`)
- 테스트 하나: `bun test test/<이름>.test.ts`
- 배포 ZIP 검사: `npm run package:zip` 뒤 `unzip -tq dist/coordinator-board-<version>.zip`
- PR 전에는 위 넷을 모두 통과시킨다. CI(`.github/workflows/verify-release.yml`)가 같은 순서로 돌린다.
- 설치된 플러그인에 반영해 볼 때: `paseo plugin install .` 뒤 `paseo plugin ls coordinator-board`가 `running`인지 본다.

## Golden Rules

### Immutable

- 플러그인 서버가 스스로 시작하는 전송에는 반드시 `sourceAgentId`를 붙인다. 출처 없는 전송은 받는 세션 기록에 사람이 쓴 말과 같은 꼴로 남고, 받는 쪽은 그것을 승인으로 읽을 수 있다. 출처 없는 `send`는 사용자가 화면에서 쓰고 누른 글에만 쓴다(받는 세션이 바빠 대기열에 넣었다가 나중에 보내는 답 포함). 보드가 만든 문장을 그 길로 보내지 않는다.
  - 근거(비대칭): 보드가 만든 문장을 보내는 `server/board-facts.ts:220`과 `server/merge-notifications.ts:115`는 `sourceAgentId`를 붙인다. 사용자 글을 보내는 `server/decisions.ts:178`, `server/digest.ts:64`, `server/tracked-decisions.ts:321`, 대기 답장의 `index.server.ts:236`는 붙이지 않는다.
  - `server/board-facts.ts:219` 주석대로, 출처를 붙인 전송이 실패하면 출처 없는 전송으로 다시 보내지 않는다. 자동 재시도도 하지 않는다.
- 권한 요청을 기다리는 세션에는 보내지 않는다. Paseo는 메시지를 받은 세션의 대기 중 권한 요청을 지운다. 새 전송 경로를 만들 때 같은 검사를 넣는다.
  - 근거(이중 방어): `server/discovery.ts:18`(`canReceiveBoardInput`), `server/merge-notifications.ts:110`, `server/board-facts.ts:201`.
- 공개 저장소다. 코드, 테스트 고정값, 문서, PR 본문에 개인 이름, 사용자 홈 경로, 기기 이름, 사설망 주소, 토큰, 다른 저장소의 내부 문서를 넣지 않는다. 예시 경로는 `~/.paseo/...`처럼 일반화한다.

### Do

- 외부 명령은 `server/prs.ts:64`의 `run`처럼 `shell:false`, 시간 제한, `maxBuffer`, 대화형 프롬프트를 끈 환경 변수(`GH_PROMPT_DISABLED`, `GIT_TERMINAL_PROMPT`)로 실행한다. 인자는 배열로 넘긴다.
- GitHub에서 읽은 글(PR 제목 등)은 화면에 내기 전에 제어 문자와 양방향 제어 문자를 지우고 길이를 자른다(`server/prs.ts:56`).
- 병합은 사용자가 확인한 head 커밋에 고정한다. `expectedHeadOid`로 보내고 SHA는 40자 hex로 검증한다(`server/pr-merge.ts:31`, `server/pr-merge.ts:35`).
- 플러그인 데이터 파일은 임시 파일에 쓴 뒤 `renameSync`로 바꾸고 `mode: 0o600`을 준다(`server/preferences.ts:90`, `server/notes.ts:44`, `server/session-photos.ts:34`).
- 화면 문구는 `client/language.tsx`의 `t(한국어, 영어)`로 두 언어를 함께 쓴다. 한쪽만 바꾸지 않는다.
- 브라우저 전용 API(`document`, `navigator`, `FileReader`, DOM 요소)는 `Platform.OS === "web"`과 `typeof` 검사 뒤에서만 쓴다. 같은 클라이언트가 모바일 앱에서도 돈다(`client/photo-composer.tsx:87`, `client/send-input.tsx:9`).
- 로직은 `client/*.ts`, `shared/*.ts`, `server/*.ts`에 두고 `.tsx`에는 화면만 둔다. 테스트가 `.tsx`를 하나도 불러오지 않는다(테스트 경계). 시험할 판단을 `.tsx` 안에 쓰면 검증 밖으로 빠진다.

### Don't

- `test/`는 `tsconfig.json`의 `exclude`에 있어 `npm run typecheck`가 보지 않는다. 테스트의 타입 오류는 `npm test`에서만 드러나니 둘 다 돌린다.
- `@getpaseo/plugin`, `@getpaseo/client` 버전을 올릴 때 `paseo-plugin.json`의 `requirements.paseo`를 함께 맞추지 않은 채 두지 않는다. 지금은 0.16.2로 같다.
- 새 최상위 폴더를 만들면 `package.json`의 `files`에 더한다. 빠지면 배포 ZIP에서 조용히 빠진다. 꼭 있어야 할 파일은 `scripts/package_release.py`의 `required`에도 더한다.
- `client/vendor/`, `third-party/`의 외부 코드를 고치지 않는다. 바꿀 때는 `THIRD_PARTY_NOTICES.md`와 라이선스 파일을 함께 갱신한다.

## Standards & References

- 사용자에게 보이는 기능을 바꾸는 PR은 `README.md`(한국어)와 `OVERVIEW.md`(영어)를 같은 내용으로 함께 고치고, `package.json`과 `package-lock.json`의 버전을 함께 올린다. 최근 PR(#11~#18)이 모두 이 셋을 함께 바꿨다.
- 한국어 문서와 화면 문구에 em dash를 쓰지 않는다. 마침표, 쉼표, 쌍점, 괄호로 바꾼다.
- 커밋·PR 제목은 한국어 한 줄로, 명사형으로 끝낸다(예: "전송 단축키 안내를 버튼의 호버·포커스 안내로 이동"). "~하라" 같은 명령형은 쓰지 않는다. main에 직접 커밋하지 않고 PR로 올리며, 병합은 squash다.
- 외부 기여 PR은 저장소 시크릿 없이 읽기 권한으로만 검증된다(`verify-release.yml`의 `permissions: contents: read`). 의존성, 패키지 스크립트, 워크플로를 바꾸는 PR은 코드보다 먼저 그 부분을 검토한다.
- Maintenance Policy: 이 파일의 규칙이나 근거 줄 번호가 코드와 어긋나면, 같은 PR에서 고치거나 고칠 것을 PR 본문에 적는다.
