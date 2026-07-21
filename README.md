# Kanban 3.10 · iOS PWA

本地优先、支持离线的项目与任务管理工具。本仓库发布 **3.10 版**。

## 这是什么

一个 ~15k 行的单 HTML 文件 — 包含全部 CSS、HTML、业务 JS、9 套主题、看板 / 月历 / 工时单 / 诉讼进度 / 计时器 / 备份 / AI 助手。3.1 版在保留桌面版所有功能的前提下，新增 iOS PWA 基础和移动端 shell。

## 怎么用

### 桌面

```bash
open index.html
```

或起一个本地 server（推荐，避免 file:// 限制）：

```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

### iPhone（PWA 模式）

部署到 HTTPS 域名后：
1. Safari 打开页面
2. 点击底部分享按钮 ⎙
3. 选择「添加到主屏幕」
4. 从主屏幕打开 — 进入 standalone 模式，可离线使用

iOS 16.4+ 支持完整 PWA 安装链路；首次启动会弹安装引导横幅。

## 3.10 版新增（相对于 3.1）

| 项 | 状态 |
|---|---|
| 月历导航按钮改为 32×32 正方形 | ✅ |
| 今日待办任务行增加拖拽手柄（⋮⋮），支持前后拖拽排序 | ✅ |
| 任务详情 UI 精简：截止/开始日期同行、删除无用"进行中"标签 | ✅ |
| 子清单独立区域：可点击 checkbox + 可编辑文本 | ✅ |
| 子清单样式优化：去除绿色 focus 框，改底部简约直线 | ✅ |
| 点击弹窗外 / ESC / × 自动保存修改 | ✅ |
| 修复计时器停止时时钟倒转 bug（stopActiveTimer end 计算错误） | ✅ |
| 修复已归档任务在今日统计中显示"已删除"（resolveTaskName 归档 fallback） | ✅ |
| 今日统计补充显示已完成但未计时的任务 | ✅ |

## 3.1 版新增（相对于 3.0 清脆版）

| 项 | 状态 |
|---|---|
| 自包含 PWA manifest（内联 SVG 图标） | ✅ |
| Service Worker（应用壳缓存 + SWR） | ✅ |
| 新版本检测 + 可控更新 | ✅ |
| 离线状态指示 | ✅ |
| iOS Safari 安装引导 | ✅ |
| Android beforeinstallprompt | ✅ |
| 移动端底部导航（4 件） | ✅ |
| safe-area-inset + 100dvh | ✅ |
| 输入框 ≥ 16px（防 iOS 缩放） | ✅ |
| 触控目标 ≥ 44px | ✅ |
| 模态改为底部 sheet | ✅ |
| 看板单列流（覆盖 JS masonry） | ✅ |
| 移动端 FAB（新建任务 + 更多） | ✅ |
| 移动端"更多"抽屉 | ✅ |
| 月历"日程/网格"切换 | ✅ |

完整设计见 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)。

## 3.10 暂未做（下一轮）

- 移动端工时单卡片重写（当前桌面表格用 CSS 隐藏，移动端留空）
- 移动端诉讼案件折叠 + 纵向时间轴（当前桌面表格用 CSS 隐藏）
- IndexedDB 迁移（数据仍走 localStorage）
- 真机 iPhone 验收与 Cloudflare Pages 部署

## 数据隐私

- 仓库**不包含**任何真实业务数据、API Key、客户文件、案件信息
- 3.0 版原文件作为"只读基线"保留在本地（`/Users/ringo/Desktop/kanban-3.0-completion-sound-crisp.html`），不进 git
- 业务数据保存在浏览器 localStorage（`kanban_projects_v30_bot` key），不上传任何服务器

## 技术栈

- 纯原生：HTML + CSS + JS，无构建工具
- 持久化：localStorage
- 离线：内联 Blob Service Worker
- 图标：内联 SVG data URL
- 兼容性：iOS 16.4+ Safari，Chrome 90+，Firefox 88+

## 目录

```
.
├── index.html         # 主文件（含全部代码 + PWA + 移动端 shell）
├── IMPLEMENTATION_PLAN.md  # 实施计划（11 节，含 phase 0-10 验收清单）
├── README.md          # 本文件
└── .gitignore
```

## 许可

个人项目。未明确开源。
