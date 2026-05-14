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

한 번 빌드해서 `/Applications`에 넣어두면 끝입니다.

```bash
git clone git@github.com:racgoo/InsomniKit.git
cd InsomniKit
pnpm install            # 또는: npm install / yarn / bun install
pnpm run pack           # Apple Silicon 기준 약 10초
```

빌드된 `.app`을 Applications로 옮기세요.

```bash
mv release/mac-arm64/Insomniac.app /Applications/
xattr -dr com.apple.quarantine /Applications/Insomniac.app
open /Applications/Insomniac.app
```

> Intel Mac은 `mac-arm64` 대신 `mac`을 사용하세요.

재부팅 후에도 자동으로 켜지길 원하면 메뉴에서 **Launch at Login**을 켜세요.

## 사용법

| 이런 상황                                  | 이렇게 하세요                                |
| ------------------------------------------ | -------------------------------------------- |
| 긴 빌드 / 다운로드 동안 깨워두기           | **Enable** + **Duration → 1h** (또는 2h)     |
| 잠금 없이 영상 계속 보기                   | **Enable** + **Duration → ∞**                |
| 배터리 낮아지면 자동으로 멈추기            | **Battery Auto-Disable → ≤ 30%**             |
| 지금 바로 끄기                             | **Disable** (또는 **Quit**)                  |

선택한 시간, 배터리 임계치, Launch at Login 설정은 재시작해도 그대로 유지됩니다.

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

## 라이선스

MIT — 마음껏 쓰세요.
