<div align="center">

# Insomniac

**원하는 시간만큼만, Mac을 깨워두세요.**

macOS용 메뉴바 유틸리티. Dock 아이콘 없음. 창 없음. 텔레메트리 없음.

![platform](https://img.shields.io/badge/platform-macOS%2012%2B-1d1d1f?style=flat-square)
![arch](https://img.shields.io/badge/arch-Apple%20Silicon%20%7C%20Intel-1d1d1f?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-1d1d1f?style=flat-square)
![status](https://img.shields.io/badge/status-stable-22c55e?style=flat-square)

[English](./README.md) · 한국어

</div>

---

## 이게 뭔가요

메뉴바의 달 아이콘을 클릭 → 시간 선택 → Mac이 잠들지 않습니다.
타이머가 끝나거나 배터리가 설정한 기준 이하로 떨어지면 자동으로 다시 잠자기 모드로 돌아갑니다.

```text
  ●  Active
  Battery: 82% ⚡
  Timer: 54m remaining
  Auto-disable: ≤ 30%
  ───────────────────
  Disable
  ───────────────────
  Duration             ▸  15m · 30m · 1h · 2h · ∞
  Battery Auto-Disable ▸  Off · ≤50% · ≤30% · ≤20%
  ───────────────────
  ☑  Launch at Login
  ───────────────────
  Quit
```

## 왜 필요한가요

터미널에서 `caffeinate`만 쓰다 보면 이런 일이 생깁니다.

- 터미널을 닫았더니 렌더링 중간에 Mac이 잠들어 버림
- 켜놓은 걸 잊고 잤더니 배터리가 다 빠짐
- 빌드가 끝나면 알아서 꺼졌으면 좋겠는데 안 꺼짐

Insomniac은 같은 일을 두 번의 클릭으로 해결합니다 — 그리고 끝나면 알아서 정리합니다.
크래시, 강제종료, `kill -9` 어떤 상황에서도 `caffeinate` 프로세스가 남거나 `pmset` 설정이 그대로 남지 않습니다.

## 영구 설치

두 줄이면 끝.

```bash
git clone git@github.com:racgoo/InsomniKit.git
cd InsomniKit
pnpm install            # 또는: npm install / yarn / bun install
pnpm run install:app    # 빌드 → /Applications에 설치 → 실행
```

이게 전부입니다 — 이미 `/Applications`에 들어갔고 메뉴바에서 돌고 있습니다.

재부팅 후에도 자동으로 켜지길 원하면 메뉴에서 **Launch at Login**을 켜세요.

### 업데이트

```bash
git pull
pnpm install            # 새 의존성이 있으면 받음
pnpm run install:app    # 실행 중인 앱 종료 → 재빌드 → 재설치 → 재실행
```

같은 스크립트. 설정값은 업데이트해도 그대로 유지됩니다.

<details>
<summary><code>install:app</code>이 하는 일</summary>

1. 실행 중인 Insomniac을 정상 종료 (그래도 안 죽으면 SIGKILL).
2. 호스트 아키텍처용으로만 빌드 (`electron-builder --mac --dir`) — 빠르고 `.dmg` 안 만듦.
3. `.app`을 `/Applications`로 이동 (`/Applications`이 쓰기 불가능한 관리형 Mac에서는 `~/Applications`로 폴백).
4. `com.apple.quarantine` 속성 제거 — 서명 없는 번들이라도 Gatekeeper가 막지 않음.
5. 실행.

</details>

## 사용법

| 이런 상황                                  | 이렇게 하세요                                |
| ------------------------------------------ | -------------------------------------------- |
| 긴 빌드 / 다운로드 동안 깨워두기           | **Enable** + **Duration → 1h** (또는 2h)     |
| 잠금 없이 영상 계속 보기                   | **Enable** + **Duration → ∞**                |
| 배터리 낮아지면 자동으로 멈추기            | **Battery Auto-Disable → ≤ 30%**             |
| 지금 바로 끄기                             | **Disable** (또는 **Quit**)                  |

선택한 시간, 배터리 임계치, Launch at Login 설정은 재시작해도 그대로 유지됩니다.

## lid를 닫으면

다들 처음에 헷갈리는 부분이라 명확히 적어둡니다.

**lid를 닫으면 항상 화면이 꺼집니다.** 이건 MacBook 하드웨어 동작이에요 — 디스플레이가 물리적으로 가려지기 때문이고, 어떤 소프트웨어도 (Insomniac, `caffeinate`, `pmset` 모두) 이걸 막을 수 없습니다. 진짜 중요한 건 **시스템 자체가 잠드는지** 입니다.

| 전원 상태                                | lid 닫음 → 시스템 잠? | 실제 동작                                                                       |
| ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| **AC 전원 + Insomniac 켜짐**             | 안 잠                | 화면만 꺼지고 백그라운드 작업(다운로드, 빌드, 동기화)은 계속 진행됨.            |
| **배터리 + Insomniac 켜짐**              | **잠**               | macOS가 lid 닫힐 때 강제로 잠재움. `caffeinate -s`는 문서상 "AC 전용". 이 상황일 때 메뉴에 `⚠︎ Lid-close sleeps on battery` 경고가 나옵니다. |
| **AC + 외장 디스플레이 + lid 닫음**      | 안 잠 (clamshell)    | Mac이 외장 디스플레이로 정상 출력. Insomniac 없이도 동작함.                     |

> **요약**: AC 전원이면 그냥 켜두고 lid 닫아도 됩니다. 작업은 계속돼요. 배터리 상태라면 먼저 충전기 꽂으세요.

`pmset disablesleep`을 쓰는 "lid 닫아도 안 자는 모드"는 admin 권한이 필요하고 시스템 설정을 건드려야 해서 아직 UI에는 노출 안 했습니다 — 로드맵 참고.

## 개발

```bash
pnpm install
pnpm run dev      # tsc + electron 실행. 변경 후 다시 실행하려면 같은 명령어 한 번 더
```

**npm**, **yarn**, **bun** 모두 동일하게 동작합니다 — 스크립트가 특정 패키지 매니저를 강제하지 않습니다.

## 배포용 빌드

```bash
pnpm run dist     # arm64 + x64 모두, .dmg / .zip 결과물이 release/ 에 생성
```

코드 서명, notarization은 하지 않습니다. 클론해서 직접 빌드하는 오픈소스 프로젝트입니다 — 배포할 거면 직접 서명하세요.

## 로드맵

- **Lid-closed 모드** — `pmset disablesleep`을 옵트인 토글로 노출. 배터리 상태에서도 시스템이 깨어있게 함. admin 비밀번호를 요구하고, 시스템 설정을 건드린다는 점을 명확히 경고.
- **전략 선택** — 메뉴에서 caffeinate vs pmset 직접 선택.
- AC 전용 모드, 외장 디스플레이 감지, 활동 기반 wake lock 등.

## 라이선스

MIT — 마음껏 쓰세요.
