# MealNote 架构说明

**版本：** V1.0 草案  
**目标形态：** 移动端优先的 Next.js Web/PWA 单体  
**原则：** AI 可替换、数据自有、计算可审计、先跑通闭环

## 1. 架构边界

MealNote 拆成两类职责：

```text
输入理解（不确定）                 营养计算（可审计）
照片/语音/文字                     食物/菜谱/个人份量
        │                                   │
        ▼                                   │
  AI provider ──结构化候选──► 用户确认 ────┘
        │                         │
        └────原始输入与 AI 运行记录┘
                                  ▼
                         Nutrition Engine
                                  │
                                  ▼
                    Meal + Nutrition Estimate 持久化
```

AI 可以猜“这可能是番茄炒蛋，约三分之一盘，油量中等”，但不能直接决定 190 kcal。Nutrition Engine 必须基于本系统可追溯的数据和用户确认来计算 190 kcal（或一个范围）。

## 2. 目标部署形态

### 生产目标

```text
手机浏览器/PWA
        │ HTTPS + authenticated session
        ▼
Next.js 单体（页面、Server Actions/API、领域服务）
        ├── Supabase Auth
        ├── Supabase PostgreSQL
        ├── 对象存储（照片/音频，按保留策略）
        └── AiMealAnalyzer provider
                └── OpenAI Responses API（可替换）
```

外部食物数据（例如 Open Food Facts、USDA）只作为导入或查询来源，不是用户历史的持久化边界。中国食物数据需要后续选择合法、可审核、适合中餐场景的来源。

### 当前本地 demo

```text
手机/桌面浏览器
        ▼
Next.js 页面 + 本地领域服务
        ├── 无凭据 demo 登录
        ├── 默认启发式识别器（配置 key 后可切换 OpenAI）
        ├── 本地 fixture 食物/菜谱与 Nutrition Engine
        └── localStorage
```

本地 demo 只用于验证交互和数据流，不提供跨设备同步、真实账号安全、云端模型准确性或生产级照片留存。所有云端能力必须通过适配器接入，不能在 UI 中写死。

## 3. 模块与职责

### 3.1 Web/PWA 层

- 移动端优先的输入、确认、保存和今日汇总界面；
- 只调用应用服务，不直接暴露 OpenAI、Supabase service role 或第三方数据源；
- 展示 `needs_confirmation`、置信度、范围和不确定性原因；
- 对离线/网络失败保留输入草稿，至少让用户通过回退路径完成记录。

### 3.2 应用服务层

建议以简单的领域模块组织在一个 Next.js 应用中：

- `meal-input`：接收文字、照片、语音转录和上下文；
- `ai-analysis`：调用 `AiMealAnalyzer`，校验 schema，记录 provider 运行信息；
- `meal-confirmation`：合并 AI 候选与用户修改，形成最终餐食条目；
- `nutrition`：调用 Nutrition Engine，禁止绕过计算器写入营养真值；
- `meal-history`：保存、查询和汇总用户餐食；
- `food-library`：食物、菜谱、别名、标准份量、用户常吃项和餐具基准。

这些是职责边界，不要求为每个模块拆成服务或独立部署。

### 3.3 AI provider

应用只依赖一个稳定的 provider 接口，例如：

```text
AiMealAnalyzer.analyzeMeal(input, context)
  -> MealAnalysisResult
```

默认实现可以使用 OpenAI Responses API 的多模态能力和结构化输出；本地 demo 使用 `HeuristicMealAnalyzer` 实现同一接口。未来可以替换模型或供应商，而不修改用户历史、Nutrition Engine 或 UI 数据模型。

provider 必须：

- 接收原始输入和有限上下文，不接收不必要的全部用户历史；
- 返回严格 schema，禁止返回一段需要正则猜测的自由文本作为唯一结果；
- 对超时、限流、无效 JSON、内容不清楚和 provider 错误返回可识别的失败状态；
- 不写入数据库，不改变用户确认过的数据；
- 记录 provider、模型、schema 版本和请求状态，必要时记录成本/延迟元数据。

### 3.4 Nutrition Engine

Nutrition Engine 是确定性领域服务，不依赖模型记忆。它的输入是用户确认后的食物/菜谱、个人份量、油量和分摊数据；输出是四大营养素、合理范围和计算依据。

推荐计算顺序：

1. 解析最终份量为克数或可追溯的体积/数量基准；
2. 匹配当前的 `food` 或 `recipe` 数据；品牌包装食品作为后续类型扩展；
3. 对菜谱按食材、烹饪损耗和油量模型计算；
4. 应用个人分摊比例和餐具基准；
5. 生成 kcal、蛋白质、脂肪、碳水及上下界；
6. 保存 `engine_version`、数据源和导致范围变化的变量。

若缺少数据，结果必须带 `needs_user_input` 或低置信标记。Nutrition Engine 不接受 AI 直接传入 kcal 等营养数值作为真值。

### 3.5 持久化与数据归属

生产目标使用 PostgreSQL（Supabase 托管可作为实现选项）；本地 demo 用 `localStorage` 实现同一领域对象的最小子集。对象存储只保存得到用户同意且有保留策略的照片/音频。

建议的逻辑数据模型：

| 实体 | 关键字段/职责 | 归属 |
| --- | --- | --- |
| `users` | auth id、偏好、时区、单位 | 系统/用户 |
| `meals` | 时间、餐别、状态、原始输入摘要 | 用户 |
| `meal_inputs` | text/photo/audio、URI、输入顺序、创建时间 | 用户 |
| `meal_items` | AI 候选、用户确认值、份量、分摊和来源 | 用户 |
| `foods` | 标准食物、别名、营养密度、来源版本 | 系统 |
| `recipes` | 标准/家庭菜谱、配料、油量假设和版本 | 系统或用户 |
| `portion_profiles` | 碗/盘/勺/个人常用份量基准 | 用户 |
| `nutrition_estimates` | 四大营养素、范围、置信度、engine 版本 | 用户历史快照 |
| `ai_runs` | provider、模型、schema 版本、状态、延迟/成本元数据 | 系统审计 |
| `user_favorites` | 常吃食物、常用菜谱、复用排序 | 用户 |

已保存的 `nutrition_estimates` 应是历史快照。后续食物数据更新不应悄悄改写过去的记录，除非用户明确请求重算并看到版本差异。

## 4. 核心请求流程

### 4.1 分析流程

```text
1. Client 创建 meal draft，上传/记录输入
2. Server 校验会话、大小/类型和输入数量
3. Input normalizer 统一 text/photo/transcript
4. AiMealAnalyzer 返回严格 MealAnalysisResult
5. Server 校验 schema 和置信度/范围约束
6. Client 展示候选、问题和需要确认的字段
7. 用户修改/确认，提交 confirmed meal items
8. Nutrition Engine 查询 food/recipe/portion 数据并计算
9. Server 保存 meal、items、estimate、审计元数据
10. 今日汇总从已保存 estimates 聚合
```

分析结果可以失败，但原始输入不能因为 AI 失败而丢失。用户确认前的候选和确认后的结果必须分开存储或至少有明确的来源字段。

### 4.2 建议的应用接口边界

以下是领域级接口，不强制当前骨架立即提供全部 HTTP 路由：

```text
POST /api/analyze             输入 → MealAnalysisResult
POST /api/nutrition/calculate 确认项 → NutritionResult
POST /api/meals               确认项 → 保存 meal + nutrition estimate（生产待实现）
GET  /api/meals?date=YYYY-MM-DD
GET  /api/day-summary?date=YYYY-MM-DD
POST /api/recipes              保存用户/家庭菜谱
GET  /api/foods/search?q=...
```

生产实现必须在服务端校验用户身份和所有权；浏览器提交的 `user_id`、营养数值、来源和权限字段都不能直接信任。

## 5. 输入与不确定性模型

### 5.1 份量归一化

中文份量词先保留 `portion_text`，再通过标准份量表、个人餐具和用户修正转换为克数或数量。不能把“碗”“盘”当作全体用户相同的固定克数。

示例：

| 原文 | 初始解释 | 需要确认的变量 |
| --- | --- | --- |
| 半碗米饭 | 用户餐具体积 × 0.5 | 碗大小、压实程度 |
| 排骨四块 | 数量 × 单块可食部分 | 块大小、骨肉比 |
| 菜三分之一盘 | 菜品总量 × 1/3 | 整盘总量、个人实际比例 |
| 一勺油 | 约一标准勺 | 勺大小、是否吃下全部油 |
| 两口 | 个人历史口量估计 | 口量差异，低置信度 |

### 5.2 范围与置信度

- `confidence` 是 0 到 1 的可比较数值，不是概率承诺；
- 当前 AI schema 提供单个 `estimated_grams` 待确认值；Nutrition Engine 输出的热量范围必须有 `low <= value <= high`；
- 低于产品阈值的候选设置 `needs_confirmation: true`；
- 范围的来源必须可解释，例如油量、菜谱、分摊比例、餐具大小或食材识别；
- UI 展示“约”“范围”“待确认”，不把估计格式化成假精确值。

## 6. AI 结构化输出契约

AI 返回值必须验证为版本化 schema。下面是概念 JSON；实现时应使用运行时 schema 校验（例如 Zod 或等价方案），并拒绝未知关键字段或不合法枚举。

```json
{
  "schema_version": "1.0",
  "items": [
    {
      "food_name": "番茄炒蛋",
      "portion_text": "约三分之一盘",
      "estimated_grams": 120,
      "oil_level": "unknown",
      "confidence": 0.72,
      "source": "text",
      "type": "recipe",
      "assumptions": [
        "按一盘约 360 克换算",
        "未说明油量，计算前请确认"
      ],
      "needs_confirmation": true
    }
  ],
  "overall_confidence": 0.72,
  "uncertainty_note": "家常菜用油和实际餐具大小需要确认。"
}
```

### 6.1 字段约束

| 字段 | 约束 |
| --- | --- |
| `food_name` | 必填、非空的用户可读名称；不是数据库真值 ID |
| `type` | 当前为 `food`、`recipe`、`drink`、`condiment` 之一 |
| `source` | 输入证据来源：`text`、`voice`、`image`、`mixed` |
| `portion_text` | 必填，保留用户原始/归一化的中文表达 |
| `estimated_grams` | 必填、正数、最大 5000；属于待确认估计 |
| `oil_level` | `none`、`light`、`standard`、`heavy`、`unknown` |
| `confidence` | 必填，0–1 |
| `needs_confirmation` | 必填布尔值；低置信或关键变量缺失时必须为 `true` |
| `assumptions` | 最多 6 条用户可读短说明；不得包含模型私有思维链或敏感信息 |

模型返回的 kcal、蛋白质、脂肪、碳水等字段即使存在也应被 schema 拒绝或忽略；这些值只能由 Nutrition Engine 产生。

## 7. Provider 与环境配置

生产目标可以提供类似以下环境变量，但没有配置时必须回退到本地实现：

```text
NEXT_PUBLIC_SUPABASE_URL        # 生产 Supabase 项目地址
NEXT_PUBLIC_SUPABASE_ANON_KEY   # 浏览器可用的 anon key
SUPABASE_SERVICE_ROLE_KEY       # 仅服务端，禁止暴露给浏览器
OPENAI_API_KEY                  # 仅服务端
OPENAI_MODEL                    # 可替换模型名
```

当前 demo 不要求这些值；不要把真实 key 写入 `.env`、客户端 bundle 或 Git。Provider 选择、超时、重试和费用上限应由服务端配置。

## 8. 安全、隐私与可靠性

- 使用 Supabase Auth 的生产会话和 PostgreSQL 行级权限/服务端所有权校验；
- 不信任浏览器提交的 user id、来源、营养数值和权限字段；
- 上传照片/音频需校验类型、大小、用户所有权和留存策略；
- 原始输入、AI 结果和营养快照分离保存，方便删除和导出；
- AI 失败、无效 schema、超时和限流必须有可见回退，不得静默保存不可信营养值；
- 所有外部数据记录来源/版本/许可；
- 对外文案明确结果是估计，不是医疗建议。

## 9. 为什么不引入更复杂基础设施

V1 的主要未知数是中餐识别质量、用户确认成本、油量和分摊建模，而不是服务拆分。单体 Next.js + PostgreSQL 足以验证这些假设。只有当监测数据证明需要独立扩缩容、异步队列或检索系统时，才评估相应拆分；在此之前不建设微服务、Kubernetes、向量库或复杂 agent workflow。
