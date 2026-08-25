# Task Eval: MealNote V1 骨架

## Goal
- 在空目录中建立可运行、移动端优先的 Web/PWA 骨架，并固化产品、架构和开发计划。

## Acceptance Criteria
- [x] README、产品需求、技术架构和开发计划覆盖当前约束与 V1 边界。
- [x] 首页呈现“输入 → 确认 → 计算 → 今日汇总”的完整可演示链路。
- [x] AI 输出使用严格 schema，Nutrition Engine 不把模型营养值当真值。
- [x] 数据模型支持模型替换、食物/菜谱/个人份量和营养结果归本系统所有。
- [x] PWA 清单、移动端布局、键盘可达性和 44px 触控目标就绪。
- [x] 所有修改仅位于 `/Users/zengtao/Doc/My code/mealnote`。

## Verification
- Command: `npm run lint`
- Expected: 无 ESLint 错误。
- Command: `npm run typecheck`
- Expected: TypeScript 类型检查通过。
- Command: `npm test`
- Expected: schema 与 Nutrition Engine 单元测试通过。
- Command: `npm run build`
- Expected: Next.js 生产构建成功。

## Manual Checks
- [x] 在 375px 宽度检查无横向滚动、主要操作可触达。
- [x] 演示文本输入、识别确认、保存和今日汇总。
- [x] 检查暗色模式与减少动态效果偏好。

## Result
- Status: PASS
- Evidence:
  - `npm run lint`：PASS，0 error。
  - `npm run typecheck`：PASS。
  - `npm test`：PASS，3 个测试文件、7 个测试。
  - `npm run build`：PASS，Next.js 16.2.7 生产构建成功。
  - Playwright 375px 端到端：本地登录、4 项食物识别、确认、599 kcal 计算、保存和“已记 1 餐”汇总全部通过。
  - 明暗模式均无横向溢出；浏览器 console error 与 page error 均为 0。
- Remaining risks:
  - 未使用真实 OpenAI key 验证多模态响应，未连接真实 Supabase 项目。
  - V1 内置食物营养值是明确标记的 demo seed，上线前必须按许可与版本复核。
  - 当前 Node.js 23 不在部分开发依赖的官方 engine 范围；建议使用 Node.js 22 LTS 或 24+。

## Security Trust-Source Check

- Current change: 客户端自报图片类型改为服务端限流读取、Base64 解码、真实字节数和 JPEG/PNG/WebP 文件头校验；演示昵称明确不作为生产认证。
- Proxy: 不适用；代码不读取 `Host`、`X-Forwarded-For`、`X-Real-IP` 或 `X-Remote-User` 做安全判断。
- Fail-closed: 请求体、图片类型、Base64、真实文件头或大小缺失/不合法时拒绝；`Content-Length` 缺失时仍按流式实际字节数限制。
- Attacker control: 客户端可修改请求字段，但服务端会重新校验严格 schema、请求体大小、解码后图片大小与文件签名；生产所有权只由 `auth.uid()` RLS 判断。
- Similar patterns: 已全库搜索 header、上传、`user_id`、`owner_id` 与本地身份读取点；未发现其他信任客户端 header 或绕过 RLS 的模式。
