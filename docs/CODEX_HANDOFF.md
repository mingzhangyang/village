# Codex 交接：Village Phase 5 — Explainability

更新日期：2026-10-03

## 1. 当前状态

仓库：`mingzhangyang/village`

已完成并合并：

- Phase 2 — Simulation Core：PR #3
- Phase 3 — Deterministic Simulation：PR #4
- Phase 4 — Simulation Test Suite：PR #5

当前 `main` 已具备 Vite / Vitest / ESLint、ES modules、Save System v2、seeded RNG，以及 economy / population / relationships / challenges / save migration / long-run invariant 测试。

Phase 5 工作分支：

`feat/explainability`

## 2. Phase 5 目标

让玩家能够直接理解“为什么世界变成这样”，而不是只看到数值结果。

第一批解释范围：

- 个人幸福：把现有幸福公式拆成可展示的正负贡献。
- 社会凝聚力：展示朋友、贫富差距、公共投入、愁苦人口、制度、灾害和茶馆等贡献。
- 离开 / 迁移风险：明确长期深度愁苦的自动离开阈值与每日概率，并提示“出去闯闯”事件候选条件。

解释层必须复用生产模拟的同一套纯计算，避免 UI 文案与真实公式漂移。

## 3. 架构边界

Phase 5 仍然不做玩法调参：

- 不改经济参数。
- 不改人口增长率。
- 不改挑战难度。
- 不改 seeded RNG 算法或随机调用顺序。
- 不改 Save System v2 key/schema。
- 解释数据由当前 state 派生，不写入存档。

建议核心模块：

`src/simulation/explainability.js`

生产模拟与 UI 都调用这里的纯函数。

## 4. 行为兼容要求

必须继续保留：

- 三个聚落、地图和 Canvas 行为
- 一年 40 天、四季各 10 天
- 四个挑战及完成记录
- 所有事件、两难抉择、建筑和人物关系
- Save System v2 与 v1 迁移
- deterministic simulation：同 seed + 同输入仍得到同结果
- 手机 pointer/touch
- dialog focus trap / restore

尤其注意：Explainability 不得额外消费 RNG。

## 5. 测试要求

至少覆盖：

- 财富平均值与 Gini 的派生计算
- 幸福贡献相加后与生产公式一致
- 凝聚力贡献相加后与生产公式一致
- 自动离开风险严格在 `sadDays > 12` 生效
- Explainability 函数不修改输入 state/person

并继续跑现有：

- `npm test`
- `npm run lint`
- `npm run build`

## 6. UI 原则

解释要就地出现，不新增复杂页面：

- 顶部凝聚力指标下方提供可展开原因分解。
- 命运追踪里显示当前人物的幸福驱动因素。
- 同一区域显示离开风险及触发条件。
- 优先展示影响最大的正负因素，避免把完整公式直接塞给玩家。

## 7. CI / 推送约束

CI 资源继续节省：

- 本地/静态检查先完成。
- 一批修改集中成一个提交再推送。
- CI 保持 lint + unit tests + build。
- 不引入 Playwright 全量 E2E。

## 8. Phase 5 完成标准

当且仅当：

- 生产模拟复用 explainability 纯计算，而不是复制第二套公式
- 幸福、凝聚力、离开风险在 UI 中可解释
- 不新增存档字段，不破坏旧存档
- 不改变 RNG 消费顺序
- 新增 explainability 单元测试
- lint / unit tests / build 全部通过
- PR 描述明确列出公式复用、兼容边界和验证结果
