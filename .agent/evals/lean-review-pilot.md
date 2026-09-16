# Lean Review Auto-Check Pilot — mealnote（第二个试点仓）

判据正文：`~/.codex/skills/dev-workflow/SKILL.md`（本仓只消费不修改）。
机制设计、七类验收场景与完整推导见 **codex-remaining** 的同名文件，此处不复制。

## 与 codex-remaining 的关系

`.claude/hooks/lean_review.py` 是**两仓逐字节相同的镜像对**（`md5 451de88a…`）。
改任何一处必须同步另一处并重新核对 md5——这与 `CLAUDE.md` / `AGENTS.md` 的做法一致。
脚本里与仓库相关的只有 `REPO`（从自身路径推导），其余通用。

## 本仓实测（2026-09-16）

| # | 场景 | 方式 | 结果 |
|---|---|---|---|
| 2 | 纯问答 | 整会话 | **SKIP**，68ms |
| 3 | 改代码不审 | 整会话 | **BLOCK**，scope=1 |
| 7 | 无法收敛 | 整会话 | block×2 → **有界退出**并标注未完成 |
| 1 | 有效 review | hook 级 | **PASS** |
| 4a | 审后改已有文件 | hook 级 | **BLOCK**（过期） |
| 4b | 审后新增文件 | hook 级 | **BLOCK**，scope 1→2 |
| 5b | 签发期间代码变了 | CLI | **拒签**，打印 token 与当前指纹 |
| 6 | 等待用户 | hook 级 | **SKIP** 且义务保留 |

Next.js/TS 仓（41 个 ts 文件 + node_modules/.next）指纹计算耗时 **0.10s**，Stop 判定 68–101ms，不构成负担。

## 状态

- [x] 接入并实测
- [ ] 试点期观察：误拦 / 漏拦 / SKIP 原因 / hook 失败 / 额外耗时 / 是否出现循环
- [ ] 与 codex-remaining 数据合并后，决定是否扩大
