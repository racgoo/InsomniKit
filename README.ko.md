<div align="center">

<br>

# ◐ &nbsp; InsomniKit

### 원하는 시간만큼만, Mac을 깨워두세요.

노트북 닫고, 자리 비우고, 에이전트는 계속 코딩하게.
작은 macOS 메뉴바 유틸리티. Dock 아이콘 없음. 창 없음. 텔레메트리 없음. 군더더기 없음.

<br>

![platform](https://img.shields.io/badge/platform-macOS%2012+-1d1d1f?style=for-the-badge&logo=apple&logoColor=white)
![arch](https://img.shields.io/badge/Apple%20Silicon%20·%20Intel-1d1d1f?style=for-the-badge)
![license](https://img.shields.io/badge/license-MIT-1d1d1f?style=for-the-badge)
![status](https://img.shields.io/badge/status-stable-22c55e?style=for-the-badge)
![vibe-coded](https://img.shields.io/badge/vibe--coded%20with-Claude%20Code-d97757?style=for-the-badge)

[English](./README.md) · **한국어**

<br>

</div>

---

<div align="center">

<img src="https://github.com/user-attachments/assets/920f5ed0-16f3-4a8f-928f-f3f485597db4" alt="6개월 전 vs 지금: 개발자가 노트북 들고 다니는 법" width="660" />

**6개월 전엔 노트북 그냥 탁 닫고 자리 떴습니다.**
**지금은 에이전트 죽을까 봐 살짝 열어둔 채로, 유리 다루듯 들고 다니죠.**

### 그냥 닫으세요. InsomniKit이 작업 살려둡니다.

</div>

---

## ⚡ 30초 시작

```bash
git clone git@github.com:racgoo/InsomniKit.git
cd InsomniKit
pnpm install && pnpm run install:app
```

끝. InsomniKit이 `/Applications`에 들어갔고 메뉴바에서 돌고 있습니다. 달 아이콘 클릭 → 시간 선택 → Mac이 안 잡니다.

> **npm**, **yarn**, **bun** 다 됩니다 — 쓰던 거 쓰세요.

---

## 뭘 해주냐면

|  | |
|---|---|
| **원클릭 토글** | 켜기. 끄기. 조작은 이게 전부입니다. |
| **타이머** | 15m · 30m · 1h · 2h · ∞ — 또는 24시간 내 아무 값이나 직접 입력. |
| **배터리 인식** | 배터리가 설정한 기준 밑으로 떨어지면 자동으로 멈춤. 50 / 30 / 20 % 또는 1~99 아무거나. |
| **Stay Awake When Closed** | 옵트인: 노트북 닫아도 시스템이 돌게 함. 배터리 상태에서도. |
| **확실한 정리** | 크래시, 강제종료, `kill -9` — `caffeinate` 좀비도, `pmset` 잔여 상태도 안 남음. 절대로. |
| **다 기억함** | 시간, 배터리 기준, Launch at Login — 다음 실행 때 그대로 복원. |

<br>

<div align="center">

<img src="https://github.com/user-attachments/assets/bd8a47de-ded4-418b-99e1-ea0eabebf9ae" alt="InsomniKit 메뉴바 드롭다운" width="340" />


<sub>이게 앱 전부 — 메뉴바에서 한 번 클릭.</sub>

</div>

---

## 에이전트 시대를 위해 만들었습니다

Claude Code / Cursor 에이전트한테 긴 리팩토링 던져놓고, 일어나서 노트북 옆구리에 끼고 소파로 이동 — 노트북은 반쯤 닫힌 채로. 10분 뒤 에이전트가 끝났겠지... 싶은데 안 끝났습니다. 노트북이 닫히는 순간 Mac이 잠들어서 작업이 중간에 죽었거든요.

이게 이 앱을 만든 이유 전부입니다.

```
  ▸ Enable → Duration ∞ → 노트북 닫기 → 에이전트 계속 돔
  ▸ 배터리 상태? "Stay Awake When Closed"가 이동 중에도 작업 살려둠
  ▸ Battery Auto-Disable로 깜빡한 에이전트가 배터리 0%까지 안 빨아먹게
```

긴 빌드, 데이터셋 다운로드, 모델 풀, 밤샘 테스트 스위트 — 다 같은 얘기입니다. *내가 안 보고 있을 때도 계속 돌아야 하는* 거라면, InsomniKit이 안전벨트입니다.

---

## 왜 그냥 `caffeinate` 안 쓰고?

써도 됩니다. 이런 일 생기기 전까지는:

- 터미널 닫았더니 — 렌더링 중간에 Mac이 잠듦.
- 켜놓은 거 잊고 잤더니 — 배터리가 밤새 다 빠짐.
- 빌드 끝나면 알아서 꺼지길 바랐는데 — 안 꺼짐.

InsomniKit은 같은 IOKit 어설션을, 두 번의 클릭으로 감싸고, 타이머 + 배터리 가드 + 앱이 어떻게 죽든 *실제로 실행되는* 정리 로직을 붙인 겁니다.

---

## 사용법

| 이런 상황                                  | 이렇게                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| 자리 비운 사이 AI 에이전트 계속 돌리기     | **Enable** → **Duration → ∞** → 노트북 닫기 (충전기 꽂거나 **Stay Awake When Closed**) |
| 긴 빌드 / 다운로드 동안 깨워두기           | **Enable** → **Duration → 1h** (또는 2h)                                 |
| 화면 안 잠그고 뭔가 계속 보기              | **Enable** → **Duration → ∞**                                            |
| 배터리 낮아지면 자동으로 멈추기            | **Battery Auto-Disable → ≤ 30%**                                         |
| 프리셋에 없는 값 쓰기                      | **Duration → Custom…** (1~1440분) · **Battery Auto-Disable → Custom…** (1~99%) |
| 지금 바로 끄기                             | **Disable** — 또는 그냥 **Quit**                                         |

메뉴에 현재 커스텀 값(`Custom: 47 minutes`)이 항상 표시돼서 헷갈릴 일 없습니다.

---

## 업데이트

```bash
git pull && pnpm install && pnpm run install:app
```

설치와 똑같은 명령. 실행 중인 앱 종료 → 재빌드 → 재설치 → 재실행, 설정은 그대로 유지됩니다.

<details>
<summary><b><code>install:app</code>이 실제로 하는 일</b></summary>

<br>

1. 실행 중인 InsomniKit을 정상 종료 (안 죽으면 SIGKILL).
2. 호스트 아키텍처용으로만 빌드 (`electron-builder --mac --dir`) — 빠르고 `.dmg` 안 만듦.
3. `.app`을 `/Applications`로 이동 — `/Applications`가 쓰기 불가능한 관리형 Mac에선 `~/Applications`로.
4. `com.apple.quarantine` 속성 제거 — 서명 없는 번들이라도 Gatekeeper가 안 막음.
5. 실행.

</details>

---

## 노트북을 닫으면

다들 헷갈리는 부분이라 솔직하게 적습니다:

> **노트북을 닫으면 항상 화면이 꺼집니다.** 이건 하드웨어 — 디스플레이가 물리적으로 가려지는 거예요. 어떤 소프트웨어도 (InsomniKit, `caffeinate`, `pmset` 전부) 화면을 못 켭니다.

진짜 중요한 건 **시스템**이 계속 도는지입니다:

| 전원 상태                          | 닫으면 → 잠?  | 실제                                                                    |
| ----------------------------------- | :------------: | ----------------------------------------------------------------------- |
| **AC** + InsomniKit 켜짐            |      안 잠      | 화면만 꺼지고 다운로드 / 빌드 / 동기화는 계속 돔.                       |
| **배터리** + InsomniKit 켜짐        |    **잠**      | macOS가 닫힐 때 강제 sleep. `caffeinate -s`는 AC 전용. 메뉴가 경고함: `⚠︎ Sleeps when closed on battery`. |
| **AC + 외장 디스플레이**            | 안 잠 (clamshell) | 네이티브 clamshell 모드 — InsomniKit 없이도 됨.                         |

**요약** — AC면 그냥 노트북 닫으세요, 작업은 계속됩니다. 배터리면 먼저 충전기 꽂으세요 — *또는* **Stay Awake When Closed**를 켜세요.

<details>
<summary><b>Stay Awake When Closed — 배터리 + 노트북 닫음용 (고급, 옵트인)</b></summary>

<br>

**배터리 상태에서** 노트북 닫고도 시스템을 깨워둬야 한다면, InsomniKit이 `pmset -c disablesleep 1`을 대신 켜줍니다. 메뉴 → **Stay Awake When Closed → Turn on…**

**일어나는 일**

- macOS의 네이티브 비밀번호 시트가 뜸 — admin 비밀번호 입력.
- 이 설정은 **시스템 전체에 영향** — 모든 앱이 영향받음.
- 기억됨: 다음 실행 시 별도 프롬프트 없이 상태를 인식.
- 같은 서브메뉴에서 끔 (비밀번호 시트 한 번 더, 복구됨).

**하지 *않는* 것**

- 노트북 닫힌 채로 화면 켜두는 거 — 못 함, 어떤 방법으로도.
- macOS 발열 제한 무시 — 노트북 닫힌 채 너무 뜨거우면 커널이 안전상 잠재움.
- 종료 시 자동 복구 안 함. 켠 채로 종료하면 다시 실행해서 끄거나 직접 `sudo pmset -c disablesleep 0` 하기 전까지 그 상태 유지.

</details>

---

## 개발자용

```bash
pnpm install
pnpm run dev      # tsc + electron — 같은 명령 다시 치면 hot-relaunch
```

| 스크립트                | 하는 일                                                   |
| ----------------------- | --------------------------------------------------------- |
| `pnpm run dev`          | 소스에서 빌드 + 실행                                      |
| `pnpm run install:app`  | 빌드 + `/Applications` 설치 + 실행                        |
| `pnpm run dist`         | arm64 & x64용 `.dmg` + `.zip`을 `release/`에 생성         |
| `pnpm run lint`         | 타입 체크만                                               |

코드 서명, notarization 없음 — 클론해서 직접 빌드하는 오픈소스입니다. 배포할 거면 직접 서명하세요.

**스택:** Electron · TypeScript · 런타임 의존성 0개. 전부 `caffeinate` / `pmset` / `osascript`를 메인 프로세스에서 조율하는 구조 — renderer도, 프레임워크도 없음.

---

## 로드맵

- [ ] 전략 선택 — 메뉴에서 `caffeinate` vs `pmset` 직접 고르기
- [ ] AC 전용 모드
- [ ] 외장 디스플레이 감지
- [ ] 활동 기반 wake lock

## Claude Code로 만들었습니다

솔직하게: InsomniKit은 **바이브 코딩**으로 만들었습니다 — 설계도 구현도 거의 전부 [Claude Code](https://claude.com/claude-code)로, 커밋 하나하나 PR 하나하나. 사람은 방향을 잡고 리뷰하고, 에이전트가 코드를 씁니다.

그러니 거슬리는 부분이 보이면 — 네, 그게 바이브 코딩입니다. 이슈나 PR 남겨주시면 만든 방식 그대로 고칩니다.

---

<div align="center">

**MIT** — 마음껏 쓰세요.

<sub>터미널 탭에서 <code>caffeinate &amp;</code> 치던 게 좀 더 나은 대접을 받을 자격이 있어서 만들었습니다.</sub>

</div>
