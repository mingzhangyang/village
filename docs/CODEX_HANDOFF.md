# Codex 交接：Village Phase 2 — Simulation Core

更新日期：2026-10-03

## 1. 当前状态

仓库：`mingzhangyang/village`

本交接文档假定 Save System v2 的 PR 已合并。当前应用仍然是无需构建即可运行的静态应用：

- `index.html`：页面结构
- `styles.css`：样式
- `storage.js`：Save System v2，作为明确的存储边界
- `app.js`：模拟、玩法、Canvas 渲染和 UI
- `README.md`：运行和存档说明

Save System v2 已完成：

- 最多 5 个自由世界存档
- 自动/手动保存
- JSON 导入和导出
- 导入非破坏性：始终创建新槽
- `hejing-save-v1` → v2 自动迁移
- 最小存档结构校验和损坏存档防护
- 挑战独立存档，不覆盖自由世界
- 挑战结束可回到原自由世界，也可把挑战世界另存为自由存档
- 页面隐藏 / pagehide 时立即保存

### 重要 localStorage 契约

不要在架构迁移时改掉这些 key 或绕过迁移：

- `hejing-save-index-v2`
- `hejing-save-v2:<slot-id>`
- `hejing-challenge-v2`
- `hejing-wins-v1`
- 旧版兼容输入：`hejing-save-v1`、`hejing-wins`

`storage.js` 暴露 `window.HejingStorage`。Phase 2 可以把它迁到 ES module，但必须保持现有 v2 数据可读，不能让已创建的存档失效。

## 2. 下一阶段目标

下一阶段是 **Phase 2 — Simulation Core 架构拆分**。

目标不是增加玩法，也不是改变数值平衡，而是建立一个可以继续演进和测试的工程结构。

建议分支：

`refactor/simulation-core`

建议引入：

- Vite
- Vitest
- ESLint（保持轻量规则）
- ES modules

发布物仍应是纯静态 HTML/CSS/JS，可部署 GitHub Pages。

## 3. 推荐目录

建议逐步迁移到：

```text
src/
  simulation/
    state.js
    clock.js
    economy.js
    population.js
    relationships.js
    health.js
    events.js
    challenges.js
    buildings.js

  world/
    map.js
    villages.js

  storage/
    index.js
    migrations.js

  ui/
    stats.js
    fate.js
    dialogs.js
    saves.js
    timeline.js
    controls.js

  render/
    map-renderer.js

  main.js
```

这只是职责边界建议，不要求为了目录好看而机械拆文件。优先抽纯逻辑，避免循环依赖。

## 4. 推荐迁移顺序

1. 建立 Vite/Vitest/ESLint 骨架，保证现有页面能启动和 build。
2. 先迁 `storage.js` 到 `src/storage`，用兼容层保持所有 v2 key 与 schema 不变。
3. 抽出 state/newState/normalization 和常量。
4. 抽出挑战规则、建筑规则、经济计算等纯逻辑。
5. 再拆 population / relationships / health。
6. 最后拆 Canvas renderer 和 DOM UI。
7. `main.js` 只负责初始化、composition、事件接线和主循环。

不要一次性重写整个应用。

## 5. 行为兼容要求

Phase 2 是 architecture-only PR。以下行为必须保留：

- 三个聚落、地图布局和 Canvas 视觉
- 当前一年 40 天、四季各 10 天
- 现有四个挑战和挑战完成记录
- 大旱挑战每年夏季 10 天
- 税率、粮食政策、事件、两难抉择
- 建筑、搬家、人物关系和命运追踪
- 所有 Save System v2 行为
- 旧 v1 存档迁移
- 手机 pointer/touch 行为
- dialog focus trap / focus restore

不要在这个 PR 同时调整经济参数、人口增长率或挑战难度。

## 6. 测试基线

Phase 2 至少补这些低成本测试，避免只靠浏览器手测：

### storage

- v1 state 能迁移到 v2，成功后才删除 v1 key
- 损坏 JSON 不会覆盖/删除其他存档
- import 创建新槽，不覆盖 active slot
- slot 上限为 5
- challenge start 保留 origin slot
- returnToOrigin 恢复挑战前自由世界
- v2 envelope export → import round trip

### simulation smoke

在尚未完成 deterministic RNG 前，不要断言随机结果，只验证稳定 invariant：

- newState 基本字段完整
- tick 后关键数值不是 NaN/Infinity
- dead/left 人物不会同时继续留在 living people
- challenge 的期限和结束条件没有 off-by-one

## 7. 后续阶段，不要提前混入

### Phase 3 — Deterministic Simulation

随后单独做 seeded RNG：

- world seed
- 替换核心模拟中的 `Math.random()`
- 同 seed + 同输入得到同结果
- 为未来“每日/每周挑战种子”打基础

不要把这个工作混进 Phase 2。

### Phase 4 — Simulation Test Suite

在 deterministic RNG 完成后扩展：

- economy
- population
- relationships
- challenge
- save migration
- 长时间 invariant / fuzz simulation

### Phase 5 — Explainability

再做幸福、凝聚力、迁移等指标的原因分解，让玩家能理解“为什么世界变成这样”。

## 8. CI / 推送约束

CI 资源要节省：

- 不要为了小修复频繁 push。
- 尽量本地完成一批修改和测试后集中推送。
- Phase 2 的 CI 只需要 lint + unit tests + build。
- 暂时不要引入每次 PR 都跑的重型 Playwright 全量 E2E。

## 9. 完成标准

Phase 2 可以认为完成，当且仅当：

- `npm test` 通过
- `npm run build` 通过
- `npm run lint` 通过
- 页面主要玩法与当前版本行为一致
- Save System v2 的现有浏览器数据仍可直接读取
- 没有改动存档 key/schema 兼容约定
- `app.js` 的主要职责已经迁出，不再是单个巨型模拟+UI文件
- PR 描述明确列出迁移边界、保留行为和验证结果

如果发现行为 bug，可以在 PR 中修复“迁移导致的回归”；与架构无关的旧玩法 bug请单独记录，不要顺手扩大范围。
