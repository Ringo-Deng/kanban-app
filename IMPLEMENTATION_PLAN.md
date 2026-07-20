# Kanban iOS PWA 适配实施计划

## 1. 文档用途

本文档用于交接给实施 Agent。目标是在不破坏现有桌面版功能和数据的前提下，将当前单文件看板改造成可安装、可离线、适合 iPhone 使用的 PWA。

实施基线：

- 源文件：`/Users/ringo/Desktop/kanban-3.0-completion-sound-crisp.html`
- 第一阶段平台：iPhone
- 最低系统：iOS 16.4
- 主要方向：竖屏
- 交付方式：私有 Git 仓库 + Cloudflare Pages
- 代码策略：桌面端与移动端共用一套数据模型和业务逻辑

本阶段不是原生 App，不使用 Swift、Xcode 或 WKWebView。

---

## 2. 已确认的产品决策

### 2.1 第一阶段必须实现

1. iPhone 主屏幕 PWA 安装。
2. HTTPS 访问与离线启动。
3. 四个核心模块全部适配：
   - 看板
   - 月历
   - 工时单
   - 诉讼进度
4. 手机底部主导航。
5. 看板单列卡片流。
6. 月历默认日程列表，可切换月历网格。
7. 诉讼进度改为案件折叠卡与纵向时间轴。
8. 保留任务详情、计时器、铃铛提醒、完成动画和完成音效。
9. 使用 IndexedDB 保存业务数据。
10. 保存最近 20 个本地快照。
11. 支持完整 JSON 导入、导出和恢复。
12. 每 7 天提示用户导出备份。
13. 在真实 iPhone 上完成安装、离线、软键盘、数据持久化和恢复测试。

### 2.2 第一阶段明确不做

1. 不做原生 iOS App。
2. 不做 Android 和专门的 iPad 布局。
3. 不做 Obsidian 自动同步。
4. 不做后台推送服务器。
5. PWA 关闭后，不承诺按时产生系统级诉讼提醒。
6. 不做 DeepSeek、AI 任务助手和工时 AI 优化。
7. 不做独立应用密码、Face ID 或业务数据加密。
8. 不重写全部业务逻辑。
9. 不将任何案件、任务或工时数据上传到 Cloudflare。

### 2.3 后续阶段候选

1. 原生 iOS 外壳或完整原生 App。
2. Obsidian Vault 自动同步。
3. Web Push 或原生本地通知。
4. AI 助手。
5. iPad 双栏布局。
6. Android。

---

## 3. 当前代码基线与主要问题

当前项目是约 14,000 行的单 HTML 文件，包含：

- 所有 CSS
- 所有 HTML
- 所有业务 JavaScript
- localStorage 数据读写
- IndexedDB Vault 句柄保存
- 看板、月历、工时单、诉讼进度、计时器、备份、主题和 AI 助手

当前已有若干 `max-width` 媒体查询，但仍属于桌面布局压缩，尚未形成真正的移动端信息架构。

当前文件中虽然存在 PWA 提示样式，但缺少完整可交付链路：

- 没有正式的 `manifest.webmanifest`
- 没有完整的 Service Worker 注册及更新流程
- 没有可验证的离线缓存策略
- 当前从 `file://` 打开，不能作为正式 PWA 安装方式

当前业务主存储仍是 `localStorage`。IndexedDB 只用于 Vault 句柄，不是业务数据主存储。

---

## 4. 总体技术方案

### 4.1 架构原则

1. 先分层，再改布局。
2. 数据模型和业务函数只保留一份。
3. 桌面端和移动端允许使用不同渲染容器，但不能复制业务状态。
4. 所有迁移必须向后兼容现有 JSON。
5. 所有危险操作必须可撤销或有备份。
6. 移动端优先使用渐进增强，不能因为某项 iOS API 不可用而阻断核心功能。

### 4.2 建议目录

```text
kanban-pwa/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── assets/
│   ├── icons/
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-512.png
│   │   └── apple-touch-icon.png
│   ├── css/
│   │   ├── tokens.css
│   │   ├── base.css
│   │   ├── desktop.css
│   │   └── mobile.css
│   └── js/
│       ├── app.js
│       ├── state.js
│       ├── storage.js
│       ├── backup.js
│       ├── pwa.js
│       ├── reminders.js
│       ├── audio.js
│       ├── board.js
│       ├── calendar.js
│       ├── timesheet.js
│       ├── litigation.js
│       ├── timer.js
│       ├── settings.js
│       └── utils.js
├── tests/
│   ├── fixtures/
│   ├── storage.test.js
│   ├── migration.test.js
│   ├── backup.test.js
│   ├── reminders.test.js
│   └── e2e/
└── README.md
```

不要求一次性完成全部拆分。建议采用“小步迁移”：每抽出一个模块，立即回归验证，避免大爆炸式重构。

---

## 5. 分阶段实施

## Phase 0：建立安全基线

### 任务

1. 复制当前清脆版作为开发基线，原文件只读保留。
2. 初始化私有 Git 仓库。
3. 创建 `main` 与 `mobile-pwa` 分支。
4. 保存一份脱敏测试数据：
   - 至少 2 个看板
   - 5 个项目
   - 20 个任务
   - 有截止日、无截止日、逾期、今天、明天任务
   - 已归档任务与工时记录
   - 至少 2 个诉讼案件
   - 每个案件至少 5 个时间轴节点
   - 至少 3 个铃铛提醒
5. 记录当前桌面版关键操作的预期结果。
6. 为现有 JSON 导出文件建立 schema fixture。

### 验收

- 原文件散列值未变化。
- 测试数据不含真实客户或案件信息。
- 当前桌面版可在修改前完整打开和使用。
- Git 初始提交只包含基线文件和测试说明。

---

## Phase 1：拆分代码与建立测试护栏

### 任务

1. 将内联 CSS 拆为 `tokens.css`、`base.css`、`desktop.css`、`mobile.css`。
2. 将业务 JavaScript按模块逐步拆出。
3. 保留全局兼容层，避免一次性改掉所有调用。
4. 为下列纯函数补测试：
   - 日期格式化与日期差
   - 时间线按日期排序
   - 提醒日期计算：前一周、前三天、前一天
   - 工时计算
   - 归档与恢复
   - JSON schema 检查
5. 禁用第一阶段不需要的 AI 入口：
   - 不删除原数据字段
   - 不加载 AI UI
   - 不调用 DeepSeek
   - 预留 feature flag：`features.ai = false`
6. 禁用移动端 Obsidian 自动同步入口：
   - 桌面端可暂时保留旧入口
   - 移动端显示“备份与恢复”
   - 预留 feature flag：`features.vaultSync = false`

### 验收

- 桌面版四个核心模块无功能回归。
- 原 JSON 可以导入。
- 新导出的 JSON 仍可被旧版本读取，或在文档中明确版本差异。
- 所有新增纯函数测试通过。

---

## Phase 2：业务数据迁移到 IndexedDB

### 数据库建议

数据库：`kanban_pwa`

对象仓库：

```text
app_state
  key: "current"
  value: 完整业务 store

snapshots
  keyPath: id
  indexes: createdAt, reason

settings
  keyPath: key

metadata
  keyPath: key
```

### 任务

1. 新建 `storage.js`，提供统一接口：

```js
loadState()
saveState(state, options)
createSnapshot(reason)
listSnapshots()
restoreSnapshot(id)
deleteOldSnapshots(limit = 20)
loadSetting(key)
saveSetting(key, value)
```

2. 不允许业务模块直接调用 `localStorage.setItem(STORAGE_KEY, ...)`。
3. 首次启动迁移：
   - 检测 IndexedDB 是否已有数据。
   - 若无，则读取现有 `kanban_projects_v30_bot`。
   - 校验数据结构。
   - 先写入 IndexedDB。
   - 从 IndexedDB 读回并比对摘要。
   - 成功后写入迁移标记。
   - 暂不删除旧 localStorage 数据，作为回滚副本。
4. 每次重要修改生成快照，但要防止高频输入产生大量快照。
5. 建议快照触发点：
   - 删除项目或任务
   - 批量整理
   - 导入覆盖
   - 恢复操作
   - 诉讼案件删除
   - 每日首次修改
6. 普通文字输入采用防抖保存，不为每个字符创建快照。
7. 最多保留 20 个快照。
8. 数据库失败时进入只读保护状态，不允许假装保存成功。

### 验收

- 现有 localStorage 数据可无损迁移。
- 刷新、关闭 PWA、重启 iPhone 后数据仍在。
- 连续修改 100 次不会产生超过 20 个快照。
- IndexedDB 写入失败时有明确提示。
- 导入覆盖前必定生成可恢复快照。

---

## Phase 3：PWA 基础设施

### Manifest

`manifest.webmanifest` 至少包含：

```json
{
  "name": "Kanban",
  "short_name": "Kanban",
  "id": "/",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f4e7d3",
  "theme_color": "#f4e7d3",
  "orientation": "portrait-primary",
  "icons": []
}
```

图标必须提供普通与 maskable 版本，并在真实 iPhone 主屏幕检查裁切效果。

### Service Worker

1. 仅缓存应用壳和静态资源。
2. 业务数据不写入 Cache Storage。
3. 首次加载采用 network-first。
4. 已安装后静态资源采用 stale-while-revalidate 或明确的版本缓存。
5. 新版本下载完成后，不直接强制刷新。
6. 页面显示“发现新版本，点击更新”。
7. 更新前先确认业务数据已保存。
8. 离线时显示简洁状态，不阻断本地操作。
9. 缓存必须使用版本号，例如 `kanban-shell-v1`。
10. 激活新 Service Worker 时清理旧缓存。

### 安装引导

iOS 不依赖通用安装弹窗。提供单独的 iPhone 引导：

1. Safari 打开页面。
2. 点击分享。
3. 点击“添加到主屏幕”。
4. 从主屏幕打开。

### 验收

- Lighthouse PWA 基础检查通过。
- 第一次在线加载后，开启飞行模式仍可启动。
- 离线时看板、月历、工时单、诉讼进度均可读写。
- 新版本发布后有可控更新提示。
- 不出现无限刷新或缓存旧版本无法更新的问题。

---

## Phase 4：移动端应用外壳

### 断点

建议：

- 移动端：`max-width: 767px`
- 桌面端：`min-width: 768px`

不要只依赖 UA 判断。

### 顶部栏

手机顶部只保留：

- 当前页面标题
- 当前看板切换入口
- 搜索入口
- 更多菜单

导出、导入、主题、回收站等低频操作移入设置或更多菜单。

### 底部导航

固定四项：

1. 看板
2. 日程
3. 工时
4. 诉讼

要求：

- 每个触控区域至少 44 × 44 CSS px。
- 使用 `env(safe-area-inset-bottom)`。
- 当前页状态清晰。
- 软键盘弹出时不得遮挡输入框。
- 打开模态框时可隐藏底部导航。

### 通用移动端规范

1. 禁止页面横向滚动。
2. 正文字号不低于 14px。
3. 输入框字号至少 16px，避免 iOS 自动放大。
4. 弹窗改为底部 Sheet 或全屏页面。
5. 使用 `100dvh`，避免地址栏导致高度错乱。
6. 使用安全区变量处理刘海和 Home Indicator。
7. 焦点进入输入框后自动滚动到可见区域。
8. 所有 hover-only 操作必须有触控替代。
9. 长按拖拽开始前提供视觉反馈。
10. 尊重 `prefers-reduced-motion`。

### 验收

- 320px 宽度下无横向滚动。
- iPhone 小屏与 Pro Max 均可使用。
- 软键盘不遮挡保存、取消按钮。
- 底部导航不遮挡列表最后一项。

---

## Phase 5：看板移动端

### 布局

1. 项目卡片改为单列纵向流。
2. 顶部筛选“全部、今天、明天、本周”允许横向滚动。
3. 搜索结果使用同一单列结构。
4. 新建任务使用右下角悬浮按钮。
5. 新建项目放入顶部更多菜单或页面空状态。
6. 卡片默认展示：
   - 项目名
   - 简短描述
   - 未完成数量
   - 可见任务列表
7. 长描述和长任务名采用合理折叠，点击进入详情。

### 任务完成

保留当前清脆版流程：

1. 用户主动勾选。
2. 播放完成音效。
3. 播放划线动画。
4. 动画结束后归档。

注意：

- 只在用户主动操作时播放声音。
- 批量导入、同步或后台迁移不得播放声音。
- 页面静音或系统限制时，归档功能仍必须成功。

### 排序

1. 项目和任务支持长按拖动。
2. 拖动时禁止页面误滚动。
3. 不支持拖动的环境提供“上移/下移”备用操作。
4. 排序结果立即保存。

### 计时器

1. 不再常驻右侧。
2. 顶部或任务行显示当前计时状态。
3. 点击后打开底部 Sheet。
4. Sheet 包含：
   - 当前任务
   - 正向计时
   - 番茄计时
   - 休息
   - 暂停
   - 结束
   - 工作备注
5. 回到前台后根据时间戳恢复，不依赖后台持续运行 JavaScript。

### 验收

- 单手可完成新建、编辑、完成、删除、恢复和排序。
- 完成动画结束后才归档。
- 计时跨锁屏和切后台后显示的时间仍正确。
- 今日、明天、本周筛选结果与桌面一致。

---

## Phase 6：月历与日程

### 默认日程列表

1. 手机进入“日程”时默认显示列表。
2. 按日期分组。
3. 每组显示日期、星期和任务数。
4. 今天、逾期、未来日期使用清晰但克制的视觉差异。
5. 任务可直接勾选、编辑日期、打开详情。
6. 月历任务完成必须播放同一音效和划线动画。

### 月历网格

1. 顶部提供“日程 / 月历”切换。
2. 网格每格只显示：
   - 日期
   - 任务数量
   - 最多 3 个颜色点
3. 点击日期后，在下方 Sheet 显示当天任务。
4. 左右滑动切换月份。
5. 保留“今天”快捷按钮。
6. 拖动修改日期不是第一阶段强制项；若保留，必须真机验证。

### 验收

- 默认列表适合单手阅读。
- 同一任务在列表和月历中的状态一致。
- 月末、跨年、闰年日期正确。
- 无日期任务有独立入口。

---

## Phase 7：工时单移动端

### 布局

1. 桌面表格在手机端改为日期分组卡片。
2. 顶部显示：
   - 当前月份
   - 总工时
   - 工作日数量
   - 项目数量
3. 每日卡片显示：
   - 日期
   - 当日总工时
   - 客户/项目
   - 任务
   - 备注
4. 编辑工时使用底部 Sheet。
5. 月份切换支持按钮，不强制手势。
6. 搜索、看板筛选放入筛选 Sheet。
7. CSV、Markdown 导出放入更多菜单。
8. 第一阶段隐藏 AI 一键优化、术语库和 API 设置。

### 验收

- 工时总数与桌面版相同。
- 编辑工时和完成日后汇总即时更新。
- CSV 与 Markdown 导出内容不变。
- 长项目名和长备注不破坏布局。

---

## Phase 8：诉讼进度移动端

### 案件列表

每张案件卡片折叠时显示：

- 案件名称
- 案号
- 法院
- 最近一条进展
- 下一项待办
- 活跃提醒数量

### 案件详情

展开后显示：

- 联系方式
- 备注
- 纵向时间轴
- 待办事项
- 新增进展
- 一键整理
- 编辑与删除

### 时间轴

1. 日期位于节点顶部。
2. 进展文字位于日期下方。
3. 待办事项在节点内部展开。
4. 支持长按拖动排序。
5. 一键整理按日期从早到晚排序。
6. 同日记录保持原相对顺序。
7. 无日期记录排到最后。

### 铃铛提醒

1. 点击铃铛打开底部日历 Sheet。
2. 日历默认定位到该时间轴节点日期。
3. 提供：
   - 前一周
   - 前三天
   - 前一天
   - 自选日期
4. 提醒记录同时保存：
   - `eventDate`
   - `targetDate`
   - `timelineId`
   - `recordId`
   - `message`
5. PWA 启动和回到前台时检查到期提醒。
6. 到期提醒在应用内常驻，直至用户确认。
7. 系统后台推送不属于第一阶段。
8. App badge 只作为渐进增强，不作为验收硬指标。

### 验收

- 9 月 1 日事项的“前一周”计算为 8 月 25 日。
- “前三天”跨月计算正确。
- 修改时间轴顺序不改变提醒关联。
- 时间轴一键整理可撤销。
- 长案件名称和大量时间轴节点仍可顺畅滚动。

---

## Phase 9：任务详情、设置与备份

### 任务详情

使用全屏或接近全屏的移动端 Sheet，包含：

- 标题
- 截止日
- 开始日
- 备注
- 子清单
- 完成
- 删除

退出前自动保存，危险操作需要确认。

### 设置页

包含：

- 主题
- 完成音效开关
- 减少动画
- 数据统计
- 导出完整备份
- 导入备份
- 本地快照
- 清空数据
- PWA 版本号
- 更新检查

### 主题

1. 默认使用当前暖色纸张主题。
2. 深色模式可跟随系统。
3. 其他主题放入设置页。
4. 所有主题必须通过文字对比度和按钮可见性测试。

### 备份

1. 导出完整 JSON。
2. 优先使用 Web Share API 调用 iOS 分享菜单。
3. 不支持分享时回退为文件下载。
4. 导入流程：
   - 读取文件
   - 校验 schema
   - 显示数据摘要
   - 用户确认
   - 创建当前数据快照
   - 覆盖
   - 重新读取并校验
5. 每 7 天检查最近一次导出时间。
6. 只提示，不强制。

### 验收

- 可从 iOS“文件”导入桌面导出的 JSON。
- 导入前显示项目、任务、工时、诉讼记录数量。
- 错误或截断 JSON 不得覆盖现有数据。
- 可从本地快照恢复。

---

## Phase 10：部署

### 私有仓库

1. 仓库不得包含：
   - API Key
   - 真实导出 JSON
   - 真实案件数据
   - 录音或客户文件
2. 增加 `.gitignore`。
3. README 说明本地开发、测试、构建和部署。

### Cloudflare Pages

1. 连接私有仓库。
2. 使用固定生产分支。
3. 启用 HTTPS。
4. 配置正确的缓存头：
   - `service-worker.js`：不长期缓存
   - manifest：短缓存
   - 带哈希静态资源：长期缓存
5. 不配置服务器端业务数据库。
6. 不上传用户业务数据。

### 验收

- 生产地址通过 HTTPS 打开。
- 可从 Safari 添加到主屏幕。
- 主屏幕打开后为 standalone 模式。
- 发布新版本后可控更新。

---

## 6. 测试矩阵

### 6.1 桌面回归

至少验证：

- Safari/macOS
- Chrome/macOS

功能：

- 看板 CRUD
- 任务完成与恢复
- 拖动排序
- 月历
- 工时
- 诉讼进度
- 铃铛提醒
- 导入导出
- 计时器
- 主题

### 6.2 移动端尺寸

开发阶段至少模拟：

- 320 × 568
- 375 × 667
- 390 × 844
- 430 × 932

### 6.3 真实 iPhone

必须验证：

1. Safari 首次访问。
2. 添加到主屏幕。
3. standalone 启动。
4. 飞行模式启动。
5. 杀掉 PWA 后重新打开。
6. 切后台 10 分钟后恢复。
7. 软键盘输入。
8. 横屏基本可用。
9. 完成音效。
10. 月历任务完成音效。
11. 计时器跨后台。
12. JSON 导出、分享、保存。
13. JSON 导入。
14. IndexedDB 持久化。
15. Service Worker 更新。

### 6.4 数据完整性

每轮发布前比较：

- 看板数量
- 项目数量
- 未完成任务数量
- 归档任务数量
- 工时记录数量与总时长
- 诉讼案件数量
- 时间轴节点数量
- 提醒数量

---

## 7. 非功能要求

### 性能

- 冷启动后 2 秒内显示应用壳。
- 1000 个任务下仍可正常滚动和筛选。
- 诉讼时间轴 200 个节点下不明显卡顿。
- 输入过程不得因整页重渲染产生明显迟滞。

### 可访问性

- 触控目标至少 44 × 44。
- 关键按钮有 `aria-label`。
- 当前导航项有明确状态。
- 键盘焦点可见。
- 减少动画模式有效。
- 不只依赖颜色表达状态。

### 可靠性

- 所有保存操作返回成功后才能提示成功。
- 页面卸载前尽量完成防抖保存。
- 导入失败不改变当前数据。
- Service Worker 更新不覆盖业务数据。
- IndexedDB 与 Cache Storage 严格分离。

### 隐私

- 生产站点不包含真实数据。
- 不引入行为分析、广告或第三方追踪。
- 不自动发送业务内容。
- 第一阶段不加载 DeepSeek SDK 或请求。

---

## 8. 建议提交顺序

每一步单独提交，便于回滚：

1. `chore: establish pwa migration baseline`
2. `refactor: extract styles and shared utilities`
3. `test: add state migration and date calculation coverage`
4. `feat: move primary state storage to indexeddb`
5. `feat: add snapshots and safe backup restore`
6. `feat: add manifest service worker and update flow`
7. `feat: add mobile shell and bottom navigation`
8. `feat: add mobile single-column board`
9. `feat: add agenda-first mobile calendar`
10. `feat: add mobile timesheet cards`
11. `feat: add mobile litigation cards and timeline`
12. `feat: add mobile settings and backup center`
13. `fix: complete iphone safe-area and keyboard handling`
14. `test: add mobile e2e and desktop regression coverage`
15. `chore: configure cloudflare pages deployment`

禁止把全部改造压在一个不可审查的大提交中。

---

## 9. 交付物

实施 Agent 最终应交付：

1. 完整源码目录。
2. 私有 Git 仓库地址。
3. Cloudflare Pages 生产地址。
4. 安装到 iPhone 的操作说明。
5. 数据迁移说明。
6. JSON 备份与恢复说明。
7. 测试报告。
8. 已知限制清单。
9. 桌面回归结果。
10. 真机验收截图或录屏。
11. 发布版本号和 commit SHA。

---

## 10. Definition of Done

同时满足以下条件才算第一阶段完成：

1. PWA 可通过 HTTPS 安装到 iPhone 主屏幕。
2. 离线可启动并使用四个核心模块。
3. 手机无横向滚动和关键按钮遮挡。
4. 数据已迁移至 IndexedDB。
5. 刷新、杀进程和重启后数据不丢失。
6. 最近 20 个快照可用。
7. JSON 导入、导出和恢复通过真机测试。
8. 看板、月历、工时单和诉讼进度均完成移动端专用布局。
9. 看板与月历的完成音效和动画正常。
10. 诉讼提醒日期计算和一键整理正常。
11. 桌面版核心功能无回归。
12. AI、Obsidian 自动同步和后台推送未误进入第一阶段。
13. Cloudflare Pages 发布与更新流程稳定。
14. 真实 iPhone 验收通过。

---

## 11. 可直接交给实施 Agent 的任务说明

> 请严格依据《Kanban iOS PWA 适配实施计划》推进。先阅读完整计划和现有 `kanban-3.0-completion-sound-crisp.html`，建立脱敏测试基线后再修改。不得覆盖原始 HTML，不得上传真实业务数据，不得把第一阶段明确排除的 AI、Obsidian 自动同步、后台推送或原生 App 工作带入范围。按 Phase 0 至 Phase 10 顺序小步实施，每个阶段分别验证桌面回归与移动端结果。遇到会改变数据模型、部署方式、同步边界或验收标准的决策时，暂停并向用户确认；普通实现细节由你自行作出稳妥选择。最终必须提供生产地址、commit SHA、测试报告、已知限制和真实 iPhone 验收结果。
