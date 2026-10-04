# 禾境 · 一座生长中的微型文明

一个在浏览器里运行的小型文明模拟。溪谷群岛上住着三十个人，每个人都有自己的职业、性格、财富和人际关系。他们每天劳作、吃饭、交朋友、结婚生子，也会挨饿、生病、离开。你可以改变规则、在关键时刻做决定、帮助某一个人，然后看这个世界会走向哪里。

## 怎么玩

- **改变的种子**：降下干旱、发现矿脉、迎来移民、疫病、商队、修水渠等事件。
- **共同的规则**：调整生产税率，选择粮食怎么分配（按需、平均、按劳、自由市场）。
- **两难抉择**：溪谷会不时来找你拍板，比如要不要和商队交易、收不收留逃荒的人。
- **点选查看**：点房子看住着哪一家，点广场或村名看聚落概况，点建筑看等级并直接升级，点田地、树林、溪水、矿洞看谁在那里干活、产量受什么影响。
- **命运追踪**：点地图上的任意一个人，看他的一生；花“恩惠”送钱、教手艺、请郎中，或者介绍他认识某人。
- **发展图谱**：攒够公库、培养出够格的行家（技能达标的农夫、渔民、工匠等），再满足设施和民心条件，才能立项研究轮作、渔网、草药、铁器、水车、印书、航路等 11 项技术，永久提升产出、健康、仓储和人口上限，溪谷会从“草创”一路走到“昌盛”。
- **开拓新土地**：掌握远洋航路后，东南海上会出现无人小岛“南屿”。人口、公库、存粮、凝聚力和志愿者全部达标才能远征；之后是六十日的开荒期，人手不足或人心思归都会让远征失败。成功后南屿成为第四个聚落。
- **建造与搬家**：在地图上盖粮仓、水井、集市、茶馆，再用“升级”把它们扩建到三级（第三级要先研究对应技术）；也可以把人拖到别的村子。
- **挑战**：熬过三年大旱、均富之岛、人丁兴旺、无人离去。

进度会自动保存在浏览器里。Save System v2 支持最多 5 个自由世界存档、手动保存、导入/导出 JSON，以及旧版存档自动迁移。挑战使用独立存档，不会覆盖长期经营的自由世界。

## 本地开发

需要 Node.js `^22.13.0 || ^24.0.0 || >=26.0.0` 和 npm。安装依赖后可启动 Vite 开发服务器：

```sh
npm install
npm run dev
```

提交前运行轻量检查：

```sh
npm run lint
npm test
npm run build
```

`npm run build` 生成静态站点到 `dist/`。Vite 使用相对资源路径，可直接部署到 Cloudflare Workers Static Assets，也仍兼容普通静态托管。

## Cloudflare Workers 部署

仓库已通过 `wrangler.toml` 配置为 Cloudflare Worker 静态资源应用：

- Worker 名称：`village`
- 生产分支：`main`
- Build command：`npm run build`
- Deploy command：`npm run deploy`
- Root directory：仓库根目录
- 静态资源目录：`./dist`
- Custom Domain：`village.orangely.xyz`

在 Cloudflare Workers & Pages 中创建或选择名为 `village` 的 Worker，然后在 **Settings > Builds** 连接本仓库。Worker 名称必须与 `wrangler.toml` 中的 `name` 一致。

`npm run deploy` 固定使用 Wrangler 4.147.0，避免 Workers Builds 因自动获取新版 Wrangler 而在没有仓库变更时改变部署行为。部署会同时发布 `dist/` 并按配置绑定 `village.orangely.xyz`。绑定前请确认 `orangely.xyz` 已由当前 Cloudflare 账号管理，并且 `village.orangely.xyz` 没有与 Custom Domain 冲突的现有 CNAME 记录。

## 工程结构

- `src/main.js`：界面、DOM 事件和应用组装。
- `src/ui/scene.js`：地图画布绘制——缓存地形层、海面与水流动画、树木房屋建筑、居民形象、季节天气与夜间灯光。
- `src/simulation/`：状态、时间、可复现随机流、人口关系、经济 tick 和挑战期限规则。
- `src/world/map.js`：固定的世界布局。
- `src/storage/index.js`：可注入 `Storage` 的 Save System v2 实现；浏览器 key 与 schema 保持兼容。
- `index.html`、`styles.css`：页面结构和样式。

本阶段只调整模块边界和测试基础设施，保留现有玩法、模拟参数、随机调用和存档契约。

## 存档

- 自由世界最多保留 5 个存档槽。
- 存档仍保存在当前浏览器的 `localStorage` 中；换设备或清除网站数据不会自动同步。
- 每个世界保存自己的模拟 seed 和随机流位置；旧存档首次加载时会从现有状态派生固定 seed。
- “导出当前”会生成可备份的 JSON 文件，“导入存档”始终创建新槽，不会覆盖现有存档。
- 旧的 `hejing-save-v1` 会在首次运行时自动迁移到 v2；迁移成功后才删除旧 key。
- 挑战保存在独立的 `hejing-challenge-v2` 中，结束或放弃后可以回到挑战前的自由世界。
