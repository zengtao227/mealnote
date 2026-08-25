# MealNote 开发计划

**目标：** 先把当前可运行 demo 的安全、数据正确性和审计边界闭合，再接入真实账号、云端持久化和真实 AI。  
**当前阶段：** V1 demo baseline 已完成；进入生产化前 hardening。  
**最后复核：** 2026-08-25  
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
- Supabase/PostgreSQL 初始 migration 和 RLS 已存在，但尚未连接真实项目；
- Next.js 已在 PR #3 从 16.2.7 升级到 16.3.3，并在 Node.js 22 / Linux 上通过 clean lockfile、`npm ci`、lint、typecheck、7/7 unit tests、production build 和 `npm audit` 0 vulnerabilities。

### 2.2 2026-08-25 独立审查结论

- **本地 V1 demo：GO。**
- **真实 Supabase + OpenAI 用户环境：NO-GO，直到下列 pre-cloud gates 闭合。**

当前阻塞生产化的不是整体架构，而是几个可局部修复的边界：

1. PostgreSQL/RLS 只检查单表 `owner_id`，还没有保证 `meal_items` / `ai_analysis_runs` 等引用对象与当前 owner 一致；
2. 一旦服务器配置真实 `OPENAI_API_KEY`，当前 `/api/analyze` 尚无真实用户鉴权、per-user rate limit 或成本保护；
3. 图片校验目前主要依赖 MIME/data URL、大小和 magic bytes，不能证明图片完整、可解码；
4. 未匹配食物会落到通用 150 kcal/100g demo fallback，当前仍可继续保存；
5. `needs_confirmation` 尚未形成真正的确认门，用户修改后的 provenance / assumptions 也未完整更新；
6. `localStorage` 保存失败没有错误回退，保存对象也没有 schema/version 校验。

这些问题应按下面的最小切片修复，不需要重写应用。

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
- [ ] 对 `localStorage` quota/security 等保存失败提供用户可理解的回退；
- [ ] 低置信/关键缺失项真正进入“必须确认”状态，而不是只有 schema 字段。

**验收证据：** 浏览器手动完成一餐；刷新后记录仍在；无云凭据时不调用网络 AI；失败路径和低置信确认需在后续 hardening 补齐后才可宣称 PASS。

### M1：领域契约与 Nutrition Engine 固化

**目标：** AI 只是候选生产者，营养计算可独立测试和追溯。

- [x] 运行时 schema 校验 `MealAnalysisResult`；
- [x] 独立 OpenAI / heuristic provider 边界；
- [x] schema 拒绝 AI 直接提供营养真值；
- [x] 份量表达支持半碗、一碗、几块、三分之一盘、一勺、一两、两口的 demo 解析；
- [x] 当前计算结果包含范围、置信度和来源；
- [ ] 定义稳定的 `food`、`recipe`、`portion profile`、`meal item`、`nutrition estimate` / snapshot 领域类型和版本；
- [ ] 未匹配食物返回显式 `needs_user_input` / fallback 状态，不能静默作为可保存的可信结果；
- [ ] canonical/alias resolver 不使用 substring 结果直接成为营养 authority；
- [ ] 用户修改食物名、重量、油量后记录 `user-confirmed` provenance，并同步更新 assumptions / confirmation state；
- [ ] 为油量、合菜分摊、未知食物、个人餐具和历史快照建立 fixture 测试；
- [ ] 持久化 `engine_version` 和输入数据源版本。

**验收证据：** 更换 analyzer 不改变 engine fixture 结果；未知食物不会无提示写入可信营养记录；用户确认值可与原 AI 候选区分。

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
- [ ] 修复跨表 owner integrity：至少覆盖 `meal_items → meals`、`ai_analysis_runs → meals`，并审查 `food_id` / `recipe_id` 对 system row 与 own row 的合法引用；
- [ ] 用两个用户的 adversarial tests 证明不能创建、读取、修改或关联另一个用户的私有对象；
- [ ] Supabase Auth 登录、退出、会话过期和错误状态；
- [ ] 服务端从 authenticated session 派生 owner，拒绝浏览器自报 `user_id` / `owner_id`；
- [ ] 服务端保存 meal、items、inputs、estimates、recipes 和 ai runs；
- [ ] localStorage 与 PostgreSQL 通过明确 storage boundary 隔离，避免页面维护两套业务规则；
- [ ] 照片/音频对象存储、删除和留存策略；
- [ ] 导出/删除用户数据的最小路径。

**硬门：** 在 owner-integrity adversarial tests 通过前，不连接真实用户数据。

**验收证据：** 两个账号无法互读、互改、互相挂接外键；刷新和跨设备登录能读取自己的服务端历史；凭据不进入客户端 bundle。

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
- [x] Node.js 22 Linux 下 lint、typecheck、7/7 tests、build、audit 全通过；
- [x] PR #3 独立审查 APPROVE 并合并。

### S1 — 数据库 authority / owner integrity（**下一步开发**）

只处理数据库关系和验证，不同时接 Auth UI 或 OpenAI：

1. 明确每个 FK 的允许关系：own meal、own private food/recipe、system food/recipe；
2. 增加数据库级约束/安全函数，使 `meal_items.owner_id` 与其引用对象不能跨用户；
3. `ai_analysis_runs.meal_id` 不得指向其他 owner 的 meal；
4. 建立两个用户的 adversarial SQL tests；
5. 保持现有 demo、API 和 UI 行为不变。

**完成条件：** 能用测试证明“伪造自己 `owner_id` + 猜到/拿到别人 UUID”仍不能创建跨租户关系。

### S2 — 确认边界与 Nutrition correctness

1. unknown/generic fallback 不能静默成为可信可保存结果；
2. `needs_confirmation` 成为真实 UI/domain gate；
3. 用户修改后的 provenance、assumptions、confidence/confirmation state 一致；
4. 修正 substring food matching authority；
5. 补充 Nutrition fixture tests。

### S3 — 输入与本地持久化 hardening

1. 对 JPEG/PNG/WebP 做结构/解码级验证，拒绝 truncated/malformed image；
2. 继续保留真实 request body byte limit；
3. localStorage 引入最小 schema version / runtime validation；
4. 捕获保存失败并让用户可重试或保留当前输入。

### S4 — Supabase Auth + PostgreSQL adapter

只有 S1 通过后开始真实账号接入；只有 S1/S2/S3 的边界明确后才迁移真实用户历史。

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

依赖变更另跑 `npm audit`。数据库变更必须增加对应的权限/完整性回归测试；图片边界变更必须增加 malformed/truncated fixture；持久化变更必须测试旧/坏数据和写失败。

### 审查方式

- 每个 hardening slice 单独分支/PR；
- PR body 写清 exact base/head、changed files、验证命令和已知非目标；
- 不把下一阶段的“顺手重构”混入当前修复；
- 独立审查重点检查 fail-closed、attacker-controlled input 和 authority source。

## 6. 风险登记

| 风险 | 早期信号 | 应对 |
| --- | --- | --- |
| 跨用户关系污染 | 自己的 row 能引用其他 owner UUID | DB 级 owner-integrity + adversarial tests |
| 公开 OpenAI 端点产生费用 | 未登录即可调用真实 provider | Auth first；per-user rate/budget；真实 key 最后部署 |
| AI 识别常见中餐不稳定 | 召回率低、确认次数高 | 文本优先、家庭菜谱、fixture 验证，必要时暂停照片扩张 |
| 未知菜产生假精确营养 | generic fallback 直接保存 | 显式低置信/需输入状态，不作为可信 nutrition authority |
| 图片伪造/截断 | magic bytes 通过但文件不可解码 | 结构/解码校验、尺寸限制、malformed tests |
| 本地保存失败导致输入丢失 | quota/security error | 捕获写失败、保留当前 draft、提供重试 |
| 食物数据许可/质量不足 | 来源或版本无法追溯 | 来源登记、抽样审核、版本化导入 |
| 范围膨胀 | 社区/商城/复杂 AI coach 进入 backlog | 回到 V1 核心记录链路和验收指标 |

## 7. 决策记录

- **Next.js 单体 PWA：** 保持；当前瓶颈不是规模基础设施；
- **AI provider 可替换：** 保持；模型不拥有历史和营养真值；
- **Nutrition Engine 独立：** 保持；这是产品可信度核心；
- **local demo：** 保持为无云凭据的开发/回退模式，但不能冒充生产账号；
- **PostgreSQL/RLS：** 作为生产 authority，但必须先闭合跨表 owner integrity；
- **真实 OpenAI key：** 最后接入，必须位于 Auth + usage protection 之后；
- **不引入微服务/Kubernetes/vector DB：** 除非后续真实负载证明需要。

## 8. 下一步

**现在应该继续开发。下一步唯一优先项是 S1：数据库 authority / owner integrity hardening。**

S1 完成并独立审查通过后，再进入 S2。不要在 S1 PR 中同时实现 Supabase 登录、真实 OpenAI 调用、Nutrition UI 重构或新产品功能。

项目的稳定上下文、当前事实、关键边界和已知风险统一记录在根目录 [`CONTEXT.md`](../CONTEXT.md)。
