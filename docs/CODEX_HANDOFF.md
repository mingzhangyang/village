# Codex 交接：Village Phase 5 — Explainability

更新日期：2026-10-03

## 1. 当前状态

仓库：`mingzhangyang/village`

已完成并合并：

- Phase 2 — Simulation Core：PR #3
- Phase 3 — Deterministic Simulation：PR #4
- Phase 4 — Simulation Test Suite：PR #5
- Phase 5 — Explainability：PR #6

Phase 5 收尾分支：

`fix/phase5-closeout`

Phase 5 的功能实现已经进入 `main`。本收尾仅消除最后两类工程遗留：迁移规则的重复定义，以及缺失的自动 CI 验证。

## 2. Phase 5 已实现范围

玩家现在可以直接理解“为什么世界变成这样”，而不是只看到数值结果：

- 个人幸福：展示财富、温饱、朋友、伴侣、健康、税负、贫富差距、季节、性格、公共投入、集市和茶馆等贡献。
- 社会凝聚力：展示朋友、贫富差距、公共投入、愁苦人口、制度、灾害和茶馆等贡献。
- 离开 / 迁移风险：展示长期深度愁苦的自动离开阈值、每日概率，以及“出去闯闯”事件候选状态。

核心模块：

`src/simulation/explainability.js`

生产模拟与 UI 共用同一套纯计算。迁移相关的幸福阈值、预警日、自动离开阈值、每日概率和“出去闯闯”条件也统一由该模块提供，避免规则在模拟、UI 与测试之间漂移。

## 3. 架构边界

Phase 5 没有改变玩法参数：

- 不改经济参数。
- 不改人口增长率。
- 不改挑战难度。
- 不改 seeded RNG 算法或随机调用顺序。
- 不改 Save System v2 key/schema。
- Explainability 数据由当前 state 派生，不写入存档。

迁移规则收敛只改变代码的单一事实来源，不改变既有数值：

- 深度愁苦：幸福 < 22。
- 第 7 个愁苦日给出预警。
- 自动离开：`sadDays > 12`。
- 自动离开每日概率：6%。
- “出去闯闯”：劳动人口、年龄 < 35 年、无伴侣、幸福 < 60。

## 4. 行为兼容要求

继续保留：

- 三个聚落、地图和 Canvas 行为
- 一年 40 天、四季各 10 天
- 四个挑战及完成记录
- 所有事件、两难抉择、建筑和人物关系
- Save System v2 与 v1 迁移
- deterministic simulation：同 seed + 同输入得到同结果
- 手机 pointer/touch
- dialog focus trap / restore

Explainability 不额外消费 RNG。自动离开仍只在满足既有资格条件时消费一次随机数；“出去闯闯”候选筛选仍是纯判定。

## 5. 测试覆盖

Explainability 单元测试覆盖：

- 财富平均值与 Gini 派生计算
- 幸福贡献总和与生产公式一致
- 凝聚力贡献总和与生产公式一致
- 迁移规则常量的既有数值
- 自动离开严格在 `sadDays > 12` 生效
- Explainability 函数不修改输入 state/person

完整验证命令：

- `npm test`
- `npm run lint`
- `npm run build`

## 6. UI 状态

解释均就地出现，没有新增复杂页面：

- 顶部凝聚力指标下方可展开原因分解。
- 命运追踪显示当前人物的幸福驱动因素。
- 同一区域显示离开风险及触发条件。
- 只优先展示影响最大的正负因素，避免直接把完整公式塞给玩家。

## 7. CI / 推送

仓库新增最小 GitHub Actions CI：

`.github/workflows/ci.yml`

只在针对 `main` 的 Pull Request 上自动运行，并保留手动触发入口；不在每次 branch push 上运行，以节省 CI 资源。

CI 执行：

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`

不引入 Playwright 全量 E2E。

## 8. Phase 5 完成标准

Phase 5 的完成标准现在由代码和 CI 共同约束：

- 生产模拟复用 explainability 纯计算，而不是复制第二套公式
- 幸福、凝聚力、离开风险在 UI 中可解释
- 迁移阈值与概率只有一个规则来源
- 不新增存档字段，不破坏旧存档
- 不改变 RNG 消费顺序
- 有 explainability 单元测试
- PR 必须通过 lint / unit tests / build
- PR 描述明确列出公式复用、兼容边界和验证结果

本收尾 PR 通过 CI 并合并后，`docs/CODEX_HANDOFF.md` 中 Phase 5 的任务即全部完成。
