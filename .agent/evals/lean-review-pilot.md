# Lean Review Auto-Check Pilot — mealnote（第二个试点仓）

判据正文：`~/.codex/skills/dev-workflow/SKILL.md`（本仓只消费不修改）。
机制设计、七类验收场景与完整推导见 **codex-remaining** 的同名文件，此处不复制。

## 与 codex-remaining 的关系

`.claude/hooks/lean_review.py` 是**两仓逐字节相同的镜像对**（`md5 e2cd81a2…`）。
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

## 2026-09-16 镜像修复回归

与 codex-remaining 同步修复三项边界，脚本继续逐字节相同：

1. staged index 内容变化现在进入 fingerprint，即使 worktree 字节不变，旧 review token 也会拒签；
2. 正确消费 `git status --porcelain=v1 -z` 的 rename/copy original-path 字段，不再生成假 scope 路径；
3. 先 BLOCK、随后代码完全回到 session baseline 时，空 scope 会清掉已失效的 pending 义务并 SKIP。

临时 Git 仓回归同时确认：dirty session baseline 不误拦、本轮提交后仍能发现、有效 receipt 连续 PASS、审后再改会 BLOCK、pause 在非空 scope 下仍保留义务。

## 2026-09-16 最终复审修复

同步关闭两项 Medium：
- fingerprint 只覆盖 `is_code(path)`，所以 receipt 后只改 Markdown / `.agent/**` 不再误报过期；
- hook 内部异常会 append `decision=error` 并写 stderr；Stop/SessionStart 作为补救型 hook 返回 0，CLI 子命令异常返回 1。

回归：README/.agent-only 改动后 receipt 继续 PASS；无 commit 仓触发内部异常时有 error 日志、无 traceback；staged-index 与 revert-pending 旧修复仍 PASS；双仓 `py_compile` / `cmp` 通过。

## 状态

- [x] 接入并实测
- [ ] 试点期观察：误拦 / 漏拦 / SKIP 原因 / hook 失败 / 额外耗时 / 是否出现循环
- [ ] 与 codex-remaining 数据合并后，决定是否扩大
