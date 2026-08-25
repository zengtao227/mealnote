# Agent Demand Gate: MealNote AI 饮食记录

## 1. Friction Point
- Current user friction: 现有热量应用要求逐项搜索食物并手填克数，难以表达合菜、家常炒菜和“半碗、几块、三分之一盘”等中式份量。
- Who experiences it: 有饮食记录需求的中国用户，以及生活在海外、经常吃中餐的华人。
- Why fixed rules or normal automation are insufficient: 固定词典可以计算已确认食物的营养值，但难以从自由文本、语音和照片稳定拆解菜名、份量、油量及多人分摊关系。
- Evidence source: 本项目需求访谈与竞品体验结论；正式开发后需通过可用性测试补充量化基线。

## 2. Quantified Gap
- Baseline metric: 当前基线待测；首轮测试记录传统应用完成一餐所需时间、操作次数和放弃率。
- Target metric: 典型一餐从输入到保存的中位时间不超过 10 秒，确认页中位修改不超过 2 次。
- Failure or exit point: 识别结果无法快速修正、营养范围无依据、或一餐记录耗时持续超过 20 秒时停止扩大 AI 功能。
- Acceptable error / misclassification rate: 首轮原型目标为主要食物召回率不低于 85%；所有低置信项必须显式提示确认，不能静默写入为营养真值。
- Measurement window: 首批 20 名目标用户、每人至少 10 餐，或累计 200 餐后复盘。

## 3. Solution Choice
- Recommended path: prompt-chain
- Why this path fits current data and change frequency: V1 只需一次多模态/自然语言结构化识别，加上确定性的 Nutrition Engine 计算；提示词和 schema 可快速迭代，风险边界清晰。
- Why the rejected paths are weaker: 自主 Agent 和复杂工作流没有必要；微调缺少标注数据；纯规则难以覆盖中式自由表达；让模型直接给营养真值不可审计。
- Smallest useful prototype: 文本或照片输入一餐，AI 输出严格 schema，用户快速确认后由本地食物/菜谱模型计算四大营养素与合理范围并保存。

## 4. Success Preview And Risk Plan
- Success standard: 用户能在约 10 秒内完成常见中餐记录，并理解结果中的不确定性来源。
- Pause / kill signal: 200 餐测试后仍无法达到 85% 主要食物召回率，或多数记录需要超过 2 次修改，暂停照片识别并回退到文本优先。
- Degraded fallback: AI 不可用或置信度过低时，保留原始输入，允许用户从常吃食物、标准菜谱和手动份量中完成记录。
- Owner and review cadence: 项目负责人每两周复盘识别质量、耗时、修改次数、失败成本和 API 成本。
