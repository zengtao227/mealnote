# MealNote

> 面向中国饮食习惯和海外华人的 10 秒极简 AI 饮食记录器。

MealNote 的目标是让用户用一句话、一张照片或一段语音，快速记录一餐中真正吃了什么。它理解“半碗米饭、排骨四块、菜吃了三分之一盘”这样的中式表达，并把不确定性说清楚。

MealNote 不是综合减肥平台，也不是让模型凭空编出一个营养数字的拍照应用。AI 负责理解输入和提出结构化估计；营养结果由本系统的 Nutrition Engine 根据可信食物数据、标准菜谱、用户菜谱和个人份量基准计算。

## 项目状态

当前项目已经完成 **V1 本地 demo baseline**，正在进入生产化前 hardening。为了让核心体验在没有云账号和 API key 的情况下仍可开发与演示，仓库继续保留本地 demo 模式：

| 能力 | 当前 demo | 生产目标 |
| --- | --- | --- |
| 登录 | 无凭据的本地 demo 登录 | Supabase Auth |
| 食物识别 | 默认本地启发式；已有可替换 OpenAI provider 代码 | 受鉴权、限流和成本保护的真实多模态 provider |
| 数据保存 | 浏览器 `localStorage` | Supabase PostgreSQL + 历史 snapshot |
| 营养计算 | 本地 fixture、标准菜谱模型和确定性计算 | 可信、版本化食物/菜谱/个人份量数据 |
| 照片/语音 | 照片预览、浏览器语音转文字；无 key 时照片识别回退到文字 | 服务端图片理解、可审计语音转录和明确留存策略 |

本地 demo 已可用于交互和数据流验证，但**真实 Supabase + OpenAI 用户环境仍是 NO-GO**，直到数据库 owner integrity、确认/营养正确性、图片/本地持久化边界、Auth 和 usage protection 依次闭合。当前批准的开发顺序见 [开发计划](docs/DEVELOPMENT_PLAN.md)，稳定项目上下文见 [CONTEXT.md](CONTEXT.md)。

2026-08-25 已将 Next.js / `eslint-config-next` 从 16.2.7 升级到 16.3.3；clean Node.js 22 / Linux 验证通过 lint、typecheck、7/7 tests、production build 和 `npm audit` 0 vulnerabilities。

## 产品边界

### V1 核心链路

```text
登录 → 拍照/文字/语音输入 → AI/本地识别为结构化候选
    → 用户快速确认或修改 → Nutrition Engine 计算
    → 保存餐食 → 查看今日汇总
```

产品 V1 要支持：

- 中国式份量表达：半碗、一碗、几块、三分之一盘、一勺、一两、两口等；
- 中餐合菜、多人分摊、家常菜和不确定油量；
- 餐前/餐后照片、油量确认、常吃食物、个人餐具和份量记忆；
- 家庭菜谱学习：把用户确认过的家常菜沉淀成可复用的菜谱，而不是依赖模型记忆；
- 四大营养素（kcal、蛋白质、脂肪、碳水）和合理范围/置信度；
- 今日餐食列表与汇总，以及在低置信度或 AI 不可用时的手动修正路径。

首版不做社区、商城、减肥课程、复杂运动同步或独立的 AI 教练。详见 [产品需求](docs/PRODUCT_REQUIREMENTS.md)。

## 技术方向

- 移动端优先的 Next.js Web/PWA 单体应用；
- 生产目标为 Supabase Auth + PostgreSQL；
- OpenAI Responses API 通过服务端 provider 边界接入，模型可替换；
- 自有 `food`、`recipe`、`portion profile`、`meal` 和 `nutrition estimate` 数据模型；
- 外部数据可评估 Open Food Facts、USDA，之后再补充合规的中国食物数据；
- 不引入微服务、Kubernetes 或向量库，除非真实数据和性能需求证明必要。

系统架构、数据归属和结构化 schema 见 [架构说明](docs/ARCHITECTURE.md)。

## 本地运行

在项目根目录执行：

```bash
npm install
npm run dev
```

然后打开终端输出的本地地址。当前本地 demo 不要求 Supabase、OpenAI 或其他云凭据；如果某个功能显示为未配置，应使用文本/手动确认回退路径，不要把 key 写入前端或提交到仓库。

建议提交或审查前至少执行：

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

依赖变更另跑 `npm audit`。具体 release gate 以 [开发计划](docs/DEVELOPMENT_PLAN.md) 为准。

## 文档导航

- [CONTEXT.md](CONTEXT.md)：当前项目状态、关键边界、已知 findings、下一批准开发切片和接手顺序；
- [产品需求与范围](docs/PRODUCT_REQUIREMENTS.md)：目标用户、用户故事、V1 验收标准和非目标；
- [架构说明](docs/ARCHITECTURE.md)：模块边界、AI provider、Nutrition Engine、数据模型和严格输出 schema；
- [开发计划](docs/DEVELOPMENT_PLAN.md)：当前生产门、hardening 顺序、里程碑、验证方式和风险；
- [设计系统](design-system/MASTER.md)：UI 实现时使用的视觉约束；
- [需求闸门](agent-demand.md)：摩擦点、量化缺口、方案选择和风险备案。

## 重要原则

1. AI 是不确定的输入解释器，不是营养学真值来源。
2. 用户历史、营养数据、菜谱和记忆属于 MealNote 自己的持久化系统，不依赖模型上下文或模型记忆。
3. 每一个 AI 估计都应保留原始输入、schema/provider 版本、置信度和需要用户确认的原因；用户修正必须有独立 provenance。
4. 估计范围比虚假的小数点精度更重要；油量、分摊比例和混合菜要显式暴露不确定性。
5. 首先闭合一餐记录的安全、数据正确性和失败回退，再扩展数据源和智能能力。

## 开发约定

新增功能应先确认它属于核心记录闭环还是非目标范围；跨越 AI、营养计算和持久化时，先更新架构契约，再写实现。任何生产云接入都必须补充鉴权、所有权完整性、隐私、错误回退、成本和数据留存说明。
