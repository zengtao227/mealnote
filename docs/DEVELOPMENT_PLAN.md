# MealNote 开发计划

**目标：** 先把当前可运行 demo 的安全、数据正确性和审计边界闭合，再接入真实账号、云端持久化和真实 AI。
**当前阶段：** S0–S3 已完成并合并（S3 = PR #7，`2afd0dc`）；CI 已上线（PR #8，`80ebd37`）；S4/S5 尚未开始。
**最后复核：** 2026-08-27
**工作方式：** 垂直切片、每步可运行、每个不确定性都保留回退；不为了“生产感”提前引入复杂基础设施。

## 1. 交付原则

1. 先验证“10 秒记录一餐”是否成立，再扩展平台功能；
2. AI 只生产结构化候选，Nutrition Engine 才能产生营养结果；
3. 生产云接入必须在身份、所有权、输入边界和成本保护通过后才能启用；
4. 任何模型、食物数据或菜谱更新都不能静默改写历史营养快照；
5. 失败路径必须保留用户输入，且允许手动完成记录；
6. 保持 Next.js 单体，不为假设规模提前引入微服务、Kubernetes、队列或向量库；
7. 文档中的 PASS / `[x]` 必须有代码、测试或运行证据支撑，不能用设计意图代替实现事实。

## 2. 当前基线与生产门

### 2.1 已验证 baseline

- 本地 demo 可完成：登录 → 文本/语音/照片输入 → 结构化候选 → 用户修改 → Nutrition Engine → `localStorage` 保存 → 今日汇总；
- AI 输出使用严格 schema，模型返回的 kcal/宏量营养字段不会成为系统真值；
- OpenAI Responses API provider 已有服务端实现，但尚未用真实 key 做质量验收；
- Supabase/PostgreSQL schema、RLS 与 owner-integrity migration 已存在，但尚未连接真实账号应用层；
- Next.js 已在 PR #3 从 16.2.7 升级到 16.3.3，并在 Node.js 22 / Linux 上通过 clean lockfile、`npm ci`、lint、typecheck、unit tests、production build 和 `npm audit` 0 vulnerabilities；
- S1 已在 PR #5 闭合跨表 owner integrity，并在 PostgreSQL 15.19 上通过顺序、特权/RLS-bypass、并发和失败迁移回滚测试；PR #5 已合并到 `main` commit `bbb7314970596bd3a753b94ebbdd119ea4027a19`；
- S2 PR #6 首轮独立审查在 head `575b87bb75cf98af3cfe48f1a183e07f8eb3a435` 找到 2 个 P1 和 1 个 P2：在途计算旧响应覆盖新编辑、heuristic substring 把复合名称升级成可信 canonical、direct API provenance 被描述得比实际可验证性更强；这些 finding 已修复；
- 第二轮独立复审在 head `3e7fcfe2837a22381becf0a0c3b3d89307039866` 找到 1 个 P1：heuristic 仍以整餐/food profile 为粒度分类和抑制 candidate，导致一个分句中的 trusted `米饭`/`红烧排骨` 可以错误授权、重绑或吞掉另一个分句里的 compound/broad candidate；
- 第三轮独立复审在 head `b471bd62ccf75a3b2a455c65553f1c764dc07831` 找到 1 个 P1：clause segmentation 本身仍被当成 authority 边界，未枚举连接词 `以及 / 与 / 还有` 可把两个 food mention 留在同一 segment，再次触发 compound → trusted canonical 和份量错绑；最终 S2 implementation 已改成 mention-span authority construction；
- mention-span S2 内容树在 Linux / Node.js 22.23.2 / PostgreSQL 15.19 上通过 `npm ci`（0 vulnerabilities）、lint、typecheck、10 files / 55 tests、production build、S1 数据库全套回归和完整 diff whitespace check；随后独立 exact-range 复审 APPROVE，PR #6 已合并为 `5c0fb4b70d0a16c29a2e182c995f4eb5582bea82`。

### 2.2 2026-08-26 当前生产化结论

- **本地 V1 demo：GO。**
- **数据库 owner-integrity 基础：GO。** S1 已完成并合并。
- **S2 confirmation + nutrition correctness：GO。** PR #6 已独立复审通过并合并。
- **真实 Supabase + OpenAI 用户环境：仍为 NO-GO。**

当前剩余 pre-cloud 关键边界主要是：

1. 一旦服务器配置真实 `OPENAI_API_KEY`，当前 `/api/analyze` 尚无真实用户鉴权、per-user rate limit 或成本保护；
2. S3 的图片完整解码校验与本地持久化 fail-closed/versioning 已随 PR #7 合并；其 16 MP / 4 通道 / 3 秒预算是应用级预算，不等于公开图片端点已完成 DoS 加固。

这些边界继续按最小切片推进，不需要重写应用。

### 2.3 S3 image/persistence boundary as merged

S3 merged as `2afd0dc` after independent exact-range approval on `5c0fb4b…706070e`. The image boundary now pins `sharp 0.35.4`, rejects all multi-frame input, and applies the same `failOn: "warning"`, 16 MP pixel, 4-channel, `unlimited: false`, and 3-second processing timeout controls to metadata inspection and raw decode. These limits are deliberately treated as an application-level budget only: they close the reproduced later-frame bypass and 36 MP decode amplification, but do not replace an outer request deadline or deployment-level concurrency/CPU/memory controls. A real public OpenAI endpoint remains NO-GO until those later deployment protections and Auth/cost controls are reviewed in their own stage.

Local persistence accepts the previous raw `SavedMeal[]` format only after strict runtime validation. A successful subsequent save writes the V1 `{ schema_version: 1, meals }` envelope; failed writes leave the old bytes and current meal state untouched. Malformed legacy data and unknown versions remain fail-closed.

## 3. 里程碑与验收

### M0：文档、边界和可运行 demo

**目标：** 任意开发者能安装并启动项目，看到最小记录闭环。

- [x] Next.js 移动端友好页面和基础路由；
- [x] 无凭据 demo 登录/退出和本地昵称隔离；
- [x] 文字、照片预览和浏览器语音输入；
- [x] 启发式识别器返回与 OpenAI provider 相同的结构化 shape；
- [x] 用户可以查看候选、修改份量/油量并继续计算；
- [x] 本地 Nutrition Engine 计算 kcal、蛋白质、脂肪、碳水与范围；
- [x] `localStorage` 正常路径保存餐食并生成今日汇总；
- [x] `npm install` / `npm run dev` 运行方法写入 README；
- [x] S3 对 `localStorage` quota/security 等读写失败提供用户可理解的错误，保存失败时保留当前结果且不污染今日汇总；
- [x] 低置信/关键缺失项进入真实“必须确认”状态；UI 与 Nutrition Engine/API 均会阻止未确认项继续计算（S2 PR #6，已合并）。

**验收证据：** 浏览器主流程可完成一餐；刷新后本地记录仍在；无云凭据时不调用网络 AI。PR #7 已覆盖保存失败回退、V1 runtime schema/version validation 和浏览器级重试；S2 confirmation 与 stale calculation freshness 仍由既有回归保护。

### M1：领域契约与 Nutrition Engine 固化

**目标：** AI 只是候选生产者，营养计算可独立测试和追溯。

- [x] 运行时 schema 校验 `MealAnalysisResult`；
- [x] 独立 OpenAI / heuristic provider 边界；
- [x] schema 拒绝 AI 直接提供营养真值；
- [x] 份量表达支持半碗、一碗、几块、三分之一盘、一勺、一两、两口的 demo 解析；
- [x] 当前计算结果包含范围、识别元数据和来源；
- [ ] 定义稳定的 `food`、`recipe`、`portion profile`、`meal item`、`nutrition estimate` / snapshot 领域类型和版本；
- [x] 未匹配/宽泛/复合食物不再静默产生 generic nutrition；Nutrition Engine/API fail-closed，用户必须改成明确支持的食物或菜谱（S2 PR #6，已合并）；
- [x] canonical/alias resolver 只允许规范化后的 exact canonical / curated exact alias 成为 nutrition authority；
- [x] heuristic candidate construction 绑定到单个 food mention span：每次 alias occurrence 保存独立 start/end、份量 context 和 trusted/embedded 状态；authority、suppression、dedupe 不再依赖整餐或 clause segmentation；
- [x] broad suppression 仅允许 trusted occurrence 抑制与其实际 overlap 的 broad occurrence；一个 trusted mention 不能授权、重绑或吞掉另一个位置的 compound/broad mention；
- [x] 已知连接词只用于恢复明确 mention 的正常 UX；未识别连接词不能制造 authority，而是 fail-closed，因此安全性不依赖穷举中文 connector；
- [x] `needs_confirmation` 是真实 UI/domain/API gate；确认前编辑不等于确认，确认后再编辑会使确认失效；
- [x] 在途 Nutrition calculation 使用 revision + AbortController；编辑、删除、确认状态变化、重置、返回输入或开始新分析都会使旧请求失效，旧响应不能成为当前 nutrition；
- [x] 用户编辑会清除 stale assumptions；field provenance、confirmation state、recognition source/confidence 在当前无服务端原始 analysis binding 的阶段明确标记为 `client-reported`，不能当成已验证审计 provenance；
- [x] 为未知食物、confirmation lifecycle、candidate/authority 分离、single-compound、mention-span connector 双向组合、重复 trusted mention、direct API tampering、deferred stale response 和代表性中餐建立 regression tests；
- [ ] 继续补合菜分摊、个人餐具和历史快照等更完整 fixture；
- [ ] 持久化 `engine_version` 和输入数据源版本。

**验收证据：** 已合并 S2 baseline 上，更换 analyzer 不改变固定 Nutrition fixture；未知/宽泛/复合名称不会制造隐藏 authority；`以及 / 与 / 还有 × 糯米饭 / 蛋炒米饭 × 双向顺序` 均保留两个独立 mention candidate 与正确份量；`半碗米饭以及一碗米饭` 保留 100g / 200g 两个 trusted occurrence；旧计算响应不能覆盖新 review state；客户端可篡改的 review metadata 不再被表述为已验证审计来源。PR #6 已经独立 exact-range 复审通过并合并。

### M2：真实数据边界与个人记忆

**目标：** 让中餐高频输入可复用、可审计。

- [ ] 建立可版本化的食物/菜谱导入格式；
- [ ] 评估 Open Food Facts、USDA 和中国食物数据的质量、许可与字段差异；
- [ ] 支持系统标准菜谱与用户家庭菜谱；
- [ ] 支持常吃食物、别名、个人餐具和历史份量基准；
- [ ] 保存数据来源、版本、导入时间和计算版本；
- [ ] 过去已保存餐食以 snapshot 显示，不被数据更新静默改写。

**验收证据：** 用户创建一道家庭菜后可复用；修改菜谱不改变旧餐食 snapshot；每个营养值可回溯到 food/recipe 数据源。

### M3：Supabase Auth/PostgreSQL 生产骨架

**目标：** 在数据库所有权模型先安全的前提下，再接真实账号和服务端持久化。

- [x] 初始 PostgreSQL schema、RLS policy 和 migration 文件已建立；
- [x] 跨表 owner integrity 已闭合：`meal_items → meals`、`ai_analysis_runs → meals` 使用 owner-aware meal FK；`food_id` / `recipe_id` 只允许 system row 或 same-owner private row；
- [x] 两用户 + privileged/RLS-bypass adversarial tests 覆盖跨 owner 关系写入、父 owner 转移、四种 catalog 并发事务顺序和失败迁移回滚；
- [ ] Supabase Auth 登录、退出、会话过期和错误状态；
- [ ] 服务端从 authenticated session 派生 owner，拒绝浏览器自报 `user_id` / `owner_id`；
- [ ] Auth 接入后补真实会话下的跨账号读/改端到端测试；
- [ ] 服务端保存 meal、items、inputs、estimates、recipes 和 ai runs；
- [ ] localStorage 与 PostgreSQL 通过明确 storage boundary 隔离，避免页面维护两套业务规则；
- [ ] 照片/音频对象存储、删除和留存策略；
- [ ] 导出/删除用户数据的最小路径。

**硬门：** 数据库 owner-integrity 已通过；真实用户数据仍必须等 Auth + session-derived owner 完成后才能接入。

**验收证据：** S1 已证明数据库关系不能跨 owner 污染；S4 还需证明真实账号无法互读、互改且刷新/跨设备可读取自己的服务端历史，凭据不进入客户端 bundle。

### M4：OpenAI Responses API 生产化

**目标：** 使用真实模型验证多模态质量，同时不改变下游营养 authority。

- [x] 服务端 OpenAI Responses API provider 已实现；
- [x] 使用 strict JSON schema，并在服务端再次做 Zod 校验；
- [x] 当前 provider 已有请求超时和 API 错误回退路径；
- [x] 文本 + 图片可进入统一分析 request；
- [ ] 真实 OpenAI 调用必须要求 authenticated session；
- [ ] 增加 per-user rate limit / usage budget / 输入数量和成本保护；
- [ ] 图片通过更强的结构/解码校验后才允许进入真实 provider；
- [ ] 记录 provider/model/schema 版本、状态、延迟和必要成本元数据；
- [ ] provider 错误、超时、额度不足、无效输出和低置信结果均保留可手动完成路径；
- [ ] 使用 fixture/录制响应做 contract tests；
- [ ] 用真实 key 建立一组中餐文本/照片质量样本并记录结果。

**硬门：** 不得在未完成 Auth + rate/cost protection 时把真实 `OPENAI_API_KEY` 部署到公开环境。

### M5：真实用户验证与 V1 发布门

**目标：** 用数据验证是否真正减少中餐记录摩擦。

- [ ] 首批 20 名目标用户，每人至少 10 餐；
- [ ] 记录完成时长、确认修改次数、主要食物召回率、失败原因和 API 成本；
- [ ] 覆盖家常菜、外卖、合菜、火锅/汤面和海外华人常见替代食材；
- [ ] 检查照片/语音同意、删除、导出和隐私文案；
- [ ] 200 餐后复盘暂停指标：召回率 < 85% 或修改次数持续 > 2 时，照片识别回退到文本优先；
- [ ] 完成构建、静态检查、单元测试、关键流程浏览器测试和移动端手动验收。

**发布门：** 核心链路可用、失败可回退、身份隔离有效、引用完整性有效、数据来源可追溯、AI 不成为营养真值，并且用户知道结果是估计值。

## 4. 当前最小开发顺序

下面顺序取代最初“直接接 Supabase/Auth，再接 OpenAI”的粗略顺序。

### S0 — 依赖安全基线（已完成）

- [x] Next.js / eslint-config-next 16.2.7 → 16.3.3；
- [x] clean cross-platform lockfile；
- [x] Node.js 22 Linux 下 lint、typecheck、tests、build、audit 全通过；
- [x] PR #3 独立审查 APPROVE 并合并。

### S1 — 数据库 authority / owner integrity（已完成）

- [x] 明确 own meal、own private food/recipe、system food/recipe 的允许关系；
- [x] `meal_items` 与 `ai_analysis_runs` 使用 owner-aware meal FK；
- [x] private catalog relationship 通过数据库 trigger + row locking 保持 same-owner，system rows 保持共享；
- [x] 两用户、privileged/RLS-bypass、四种并发顺序与失败迁移回滚测试；
- [x] PR #5 经独立复审 APPROVE，并 squash-merge 到 `main` commit `bbb7314970596bd3a753b94ebbdd119ea4027a19`。

### S2 — 确认边界与 Nutrition correctness（已完成并合并）

- [x] unknown/generic fallback 不再静默成为可信可保存结果；
- [x] `needs_confirmation` 成为真实 UI/domain/API gate；
- [x] stale calculation response 使用 revision + abort fail-closed，edit/remove/reset/new analysis 后旧结果无法落地；
- [x] trusted resolver 只接受 exact canonical/curated alias；
- [x] heuristic candidate construction 改为 mention-span：每个食物 occurrence 绑定独立 start/end 与 portion context，不依赖整餐或 clause segmentation 共享 authority；
- [x] broad suppression 只允许 overlap 的 trusted occurrence 覆盖同一 broad occurrence；非 overlap mention 不互相授权或吞掉；
- [x] unknown connector/segmentation fail-closed；已知 joiner 仅用于恢复正常 explicit trusted mention UX，而不是安全前提；
- [x] broad/compound heuristic candidate 与 trusted nutrition authority 分层，compound acknowledgement 本身仍不能制造 nutrition authority；
- [x] review provenance / recognition / confirmation metadata 明确为 `client-reported`，不冒充 server-verified provenance；
- [x] 补充 resolver、review、engine、API、heuristic、request-guard、mention-span adversarial combinations 和代表性中餐 fixture tests；
- [x] clean verification：Node.js 22.23.2，10 files / 55 tests，build，S1 PostgreSQL 15.19 regression，diff check 全 PASS。

**完成状态：** PR #6 已经 exact-range 独立复审 APPROVE，并合并为当前 S3 base `5c0fb4b70d0a16c29a2e182c995f4eb5582bea82`。

### S3 — 输入与本地持久化 hardening（已完成，PR #7 合并为 `2afd0dc`）

- [x] JPEG/PNG/WebP 在 provider 前做完整解码验证，拒绝 truncated/corrupt/magic-bytes-only 输入；
- [x] 保留真实 streamed request-body byte limit 与 5 MiB encoded-image byte 上限；增加 16 MP 解码像素上限，V1 拒绝动画/多帧图片；
- [x] localStorage 使用最小 V1 `{ schema_version, meals }` envelope 与严格 runtime validation；合法 base raw-array 历史可读取，并在下一次成功保存时懒迁移为 V1；
- [x] 非法 JSON、结构/日期/营养错误、未知版本与 get/set storage exception 均 fail closed；
- [x] 保存失败显示现有 `InlineMessage` 错误，不显示“已保存”、不改变今日汇总，并保留当前 result/draft 允许重试；
- [x] 保持现有按本地 profile 隔离的 key 规则，不引入 migration framework 或数据库迁移。

**完成状态：** 独立 exact-range 复审在 `5c0fb4b…706070e`（1 commit / 25 files）APPROVE。复审期间关闭三个 blocker：损坏第二帧的 WebP 现被识别为多帧并在 provider 前拒绝；11,237 字节的 6000×6000 PNG 在 metadata pixel guard 阶段即被拒绝，不会创建 raw decode pipeline；上一正式版本的 raw `SavedMeal[]` 可读回并在下一次成功保存时懒迁移为 V1。验证：Node 22 / `npm ci` 0 vulnerabilities / lint 0 errors / typecheck / **18 files / 142 tests** / build / `npm audit --audit-level=low` 0 vulnerabilities / `git diff --check`。

**残余风险（不阻塞 S3，必须带到 S4/S5）：** 单请求最多仍可能产生约 64 MB raw bitmap，3 秒 `sharp.timeout()` 只约束单请求解码、不约束并发；localStorage 不是防篡改存储。因此 Auth、per-user 限额、资源隔离和真实 OpenAI key 公开部署的硬门继续保留。

### S4 — Supabase Auth + PostgreSQL adapter

只有 S1/S2/S3 的边界完成后开始真实账号接入与用户历史迁移；数据库 owner integrity 已是前置基础，不应在 S4 重新设计。

### S5 — 真实 OpenAI quality slice

只有 Auth 和 rate/cost protection 生效后配置真实 key；先用固定中餐样本评估，而不是扩大功能范围。

## 5. 验证计划

### 每个 PR 的最低验证

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

依赖变更另跑 `npm audit`。数据库变更必须增加对应的权限/完整性回归测试；图片边界变更必须增加 malformed/truncated fixture；持久化变更必须测试旧/坏数据和写失败；异步响应会覆盖可变用户状态的路径必须增加 deferred/stale-response 回归。

### 审查方式

- 每个 hardening slice 单独分支/PR；
- PR body 写清 exact base/head、changed files、验证命令和已知非目标；
- 不把下一阶段的“顺手重构”混入当前修复；
- 独立审查重点检查 fail-closed、attacker-controlled input、authority source 和跨层/跨时间状态一致性；
- candidate/authority 变更必须同时测试 producer → review → resolver/engine 的完整链路，并覆盖同 profile 多 occurrence、未知/未枚举 connector、双向顺序和重复 trusted mention，不能只测孤立单条输入或已知分隔符。

## 6. 风险登记

| 风险 | 早期信号 | 应对 |
| --- | --- | --- |
| 跨用户关系污染 | 自己的 row 能引用其他 owner UUID | S1 DB owner-integrity + adversarial/concurrency tests；S4 再验证真实 Auth 会话隔离 |
| 公开 OpenAI 端点产生费用 | 未登录即可调用真实 provider | Auth first；per-user rate/budget；真实 key 最后部署 |
| AI 识别常见中餐不稳定 | 召回率低、确认次数高 | 文本优先、家庭菜谱、fixture 验证，必要时暂停照片扩张 |
| 未知/复合菜产生假精确营养 | fuzzy mention 被改写成 trusted canonical，或另一 occurrence 导致 candidate 被吞/份量错绑 | S2 exact resolver + mention-span candidate authority + overlap-only suppression + unknown-segmentation fail-closed tests |
| 旧计算响应覆盖新编辑 | 请求期间修改/删除后旧 nutrition 再出现或可保存 | S2 request revision + AbortController + deferred edit/remove tests |
| 客户端 metadata 被误当审计真值 | direct API 可伪造 edited_fields/source/confidence | 当前全部标记 client-reported；未来服务端 analysis binding 后再建立 verified provenance |
| 图片伪造/截断 | magic bytes 通过但文件不可解码 | S3 结构/解码校验、尺寸限制、malformed tests |
| 本地保存失败导致输入丢失 | quota/security error | S3 捕获写失败、保留当前 draft、提供重试 |
| 食物数据许可/质量不足 | 来源或版本无法追溯 | 来源登记、抽样审核、版本化导入 |
| 范围膨胀 | 社区/商城/复杂 AI coach 进入 backlog | 回到 V1 核心记录链路和验收指标 |

## 7. 决策记录

- **Next.js 单体 PWA：** 保持；当前瓶颈不是规模基础设施；
- **AI provider 可替换：** 保持；模型不拥有历史和营养真值；
- **Nutrition Engine 独立：** 保持；这是产品可信度核心；
- **candidate 与 nutrition authority 分离：** S2 明确固化；模糊/复合自然语言可成为待用户修正的候选，但不能直接获得可信营养 profile；
- **candidate 粒度：** heuristic authority 绑定到 individual mention span；meal/clause/connector 只可影响展示或 UX，不能作为共享 authority 边界；
- **unknown segmentation：** 未识别连接形式必须 fail-closed，不能因为 parser 没切开就让 trusted mention 给邻近 compound mention 授权；
- **异步计算 freshness：** UI 只有与当前 review revision 一致的 calculation response 才能成为当前 nutrition；旧请求在 review state 改变时 abort/invalidated；
- **provenance verification：** S2 当前 API 没有服务端原始 analysis binding，因此 review provenance、confirmation 和 recognition metadata 只能标记为 `client-reported`；以后建立服务端绑定后才能升级为 verified；
- **local demo：** 保持为无云凭据的开发/回退模式，但不能冒充生产账号；
- **PostgreSQL/RLS：** 作为生产 authority；S1 已闭合关系级 owner integrity，S4 再接真实 Auth/session；
- **真实 OpenAI key：** 最后接入，必须位于 Auth + usage protection 之后；
- **不引入微服务/Kubernetes/vector DB：** 除非后续真实负载证明需要。

## 8. 下一步

S0–S3 已全部合并。按第 4 节的既定顺序，**S4（Supabase Auth + session-derived owner）是下一开发优先项**。

另有一份 S3.5 提案 [`proposals/S3.5-food-resolution-usability.md`](proposals/S3.5-food-resolution-usability.md)，主张在 S4 之前插入一个产品价值切片，验证「10 秒记录一餐」这一交付原则第 1 条是否成立（S0→S3 从未触及它）。**该提案尚未批准**，必须经独立复审后才能实施或改变上面的顺序。

工程约定变更：CI 已上线（`.github/workflows/ci.yml`，PR #8）。每个 PR 复用它，不再新建一次性验证 workflow。

项目的稳定上下文、当前事实、关键边界和已知风险统一记录在根目录 [`CONTEXT.md`](../CONTEXT.md)。