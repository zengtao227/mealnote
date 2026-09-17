# Handoff — mealnote

## Completed
- 2026-09-17：Lean Review v2 冻结并合并 main（`e1fa8ee`）：Stop 提示改为「新增能力/组件/依赖/责任层/状态/配置/补偿机制时才做方向判断」，`--outcome` 不再预设 none，`unverified`（审完、方向待批）与 `pause`（审查缺用户输入）分开。镜像 md5 `85a02e64…`。4 个真实任务试运行无 Medium；真实 receipt outcome 待解冻后自然观察。
- 2026-09-16：同步最终两项 Medium 修复：非代码改动不再使 receipt 失效；hook 内部异常可观测并写 error 日志。镜像 md5 `e2cd81a2…`。
- 2026-09-16：接入 lean review auto-check 试点（分支 `feat/lean-review-pilot`，commit `99902a3`）。八项场景实测通过。
- 2026-09-16：用瘦身判据对**真实代码**做了第一次审查（此前只用 `scratch_probe.ts` 探针验证机制）。
- 2026-09-16：同步修复 lean-review 三个边界：staged index 指纹、rename/copy `-z` 解析、scope 回到 0 后清失效 pending；与 codex-remaining 镜像 md5 `308ece13…`，定向与核心回归全绿。

## Current State
- lean review 试点（PR #18）与 v2 均已合并 main。日志 `.agent/lean-review/log.jsonl`（gitignore）。
- 源码 60 个跟踪文件，src 合计 8696 行。

## Next Steps
1. **本轮没找到可删的死路径**——这是合法结论，不是没查。粗筛出的 4 个「零引用」候选逐个核过：
   - `src/app/api/analyze/route.ts`、`src/app/api/nutrition/calculate/route.ts`、`src/app/manifest.ts` = **Next.js 文件路由/约定文件，属判据4 的「动态入口」**，没有 import 不等于没人调用。
   - `src/lib/evaluation/meal-corpus.ts`（821 行）= 被 `npm run measure:catalog-baseline` 和 `docs/proposals/S3.5-food-resolution-usability.md` + `fixtures/meal-corpus/README.md` 契约引用 → **保留**。
   教训已验证：第一版扫描脚本引号写错，把 13 个模块全报成零引用；**「搜不到调用」在这里 100% 是假阳性**。
2. **两个大文件，待核实不要贸然拆**（判据6）：`src/components/meal-workbench.tsx` 1049 行、`src/lib/ai/heuristic-provider.ts` 976 行。**仅凭行数不构成拆分理由**（同 STP ChamberLayout 的教训）。要拆先给出具体维护成本：改一处要动几块、测试是否难写、有没有反复出 bug 的区域。
3. **解冻后 dead-code cleanup：删除 3 个无效边界 helper 并重建语料基线。** `src/lib/ai/heuristic-provider.ts` 的 `hasHardBoundaryBefore`、`hasHardBoundaryAfter` 当前各触发一条 unused warning；`isTokenCharacter` 仅被这两个函数调用，前两者删除后也应一并删除。三者来自 S2 PR #6，当前无运行调用。**真人 S3.5-E 完成前不要删**：baseline 的 `engine_digest` 直接 hash `heuristic-provider.ts` 全文件，删除即改变 pinned engine evidence。解冻后将三者作为独立 cleanup 删除，重新生成 `s3.5-text-heuristic-baseline.md`；预期 corpus/catalog digest 和所有指标完全不变，只允许 engine digest 更新，并跑 lint/typecheck/full tests/build/`git diff --check` 验证。
4. **解冻后 bug：文本一个食物都没识别出来时返回笼统 500**（冻结期不修，CONTEXT.md §10 运行时代码冻结）。`heuristic-provider.ts` 在 `rawMentions.length === 0` 时抛普通 `Error`，`/api/analyze` 落到兜底 `500 识别请求失败，请重试。`，有用提示丢失、重试必然同样失败、用户进不了目录补项流程；`route.test.ts` 未覆盖。修复方向：从目标重新设计「识别不到时仍能进入安全的人工补全路径」，**不得为了消灭 500 放宽可信度规则**；注意 `meal-analysis-schema.ts` 的 `items.min(1)` 与语料基线「analysis-failure 不可恢复」口径会受影响。
5. **Unknown food 无法保存（用户反馈）**：冻结期定 **C = 保持现状并记录**。解冻后**优先评估 B = 待补全草稿**（只存输入与核对状态，不带营养数值、不进当日汇总，补成可信食物后走原计算与确认再正式保存），而不是 A「直接允许未识别食物保存」（会改保存门槛、存储 schema 版本、汇总口径、calculate 接口与 F06 评分）。这是下一轮产品设计输入，不是已批准实现。

## Key Decisions
- 判据检查的是「当前复杂度有没有充分理由存在」，不是「让代码变少」。本轮 mealnote 的删除轴结论是 **保留**，有依据。
