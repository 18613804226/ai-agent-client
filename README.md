
# 🤖 AI RAG 智能体知识库（多端流式问答系统 & 客户端）

一个基于 **NestJS + React Native Expo + PGVector + 千问大模型** 搭建的轻量化私有知识库与 RAG 智能体系统。本项目完整实现了从私有文档解析, 向量化, 相似度检索, 大模型推理到 SSE 流式逐字输出的完整 AI 问答链路, 并完美适配 Web 网页端与移动端双端体验。前端客户端采用极简的高级感暗黑/明亮双模设计, 深度对标目前主流的消费级 AI 产品。

---

## 🚀 项目简介

本项目旨在为中小企业或个人提供一套可落地, 可商用的私有知识库解决方案。通过标准 RAG（Retrieval-Augmented Generation）架构, 有效解决了大模型落地时的“知识盲区”与“数据隐私”痛点。

* **双端统一架构**：Web 端采用左侧常驻知识库侧边栏, App 端采用左滑抽屉知识库, 核心业务逻辑完全复用, 仅针对 UI 布局进行多端自适应适配。
* **完整工程闭环**：不依赖黑盒框架, 全链路自主实现, 适用于企业制度查询, 工厂手册问答, 私有业务客服等真实场景。

---

## 🛠️ 核心技术栈

### 前端（多端统一）

* **React Native / Expo**：移动端跨平台开发, 基于 Expo Router 构建, 完美适配 Web 端, 移动端, 桌面端。
* **流式通信**：SSE（Server-Sent Events）流式订阅, `ReadableStream` 实时流处理。
* **交互体验**：多端 UI 自适应, 抽屉式侧边栏, 多格式文件解析上传。
* **动效与键盘**：react-native-reanimated 4 驱动动效, react-native-keyboard-controller 原生逐帧键盘高度, 位移与折叠动画全部跑在 UI 线程。

### 后端

* **NestJS + TypeScript**：企业级高扩展性后端架构。
* **PostgreSQL + PGVector**：高性能关系型与向量混合数据库。
* **大模型与向量化**：阿里通义千问 Embedding 向量化模型 + 千问大模型文本生成。
* **文档解析**：支持 `TXT`、`PDF` 等多格式私有文档解析（`DOCX` 待支持）。

---

## 📦 项目结构

```text
├── app/                  # Expo Router 页面与导航入口
├── assets/               # 图片、图标等静态资源
├── src/
│   ├── components/       # 页面与可复用 UI 组件
│   ├── constants/        # 主题与应用常量
│   ├── context/          # 全局状态与 Provider
│   ├── hooks/            # 聊天、键盘等业务逻辑
│   ├── services/         # API 与外部服务
│   ├── store/            # 状态管理
│   ├── types/            # TypeScript 类型定义
│   └── utils/            # 通用工具与平台适配
├── .github/workflows/    # CI/CD：类型检查、Web 部署、一键打 APK
├── patches/              # patch-package 补丁（npm install 时自动应用）
├── plugins/              # 本地 Expo Config Plugin（ABI 分包注入）
├── scripts/              # CI 安卓签名注入等构建脚本
├── app.json              # Expo 应用配置
├── .env.example          # 环境变量模板（复制为 .env 使用）
├── package.json          # 依赖与运行脚本
└── tsconfig.json         # TypeScript 配置
```

---

## ✨ 核心特性与亮点

1. **双端一体化体验**：Web 常驻侧边栏与 App 抽屉式知识库无缝切换, 多端业务逻辑高度复用。
2. **大厂级 UI/UX 交互**：
* 沉浸式双轨响应式布局（桌面端常驻侧边栏, 移动端抽屉平滑滑入与蒙层过渡）。
* 支持浅色、深色与跟随系统三种外观模式；系统模式会响应设备主题变化，用户选择会保存在本地。
* 自适应多行输入框, 精美 Markdown 气泡流（支持跨段落连续选词、复制）, 现代滚动条优化；键盘由 react-native-keyboard-controller 逐帧跟手, 输入区提示文字随键盘平滑折叠。
* 多模态附件消息：图片（缩略图与全屏预览）、文档、视频统一附件卡片, 点击可直接预览。
* 语音朗读：AI 回答一键朗读（句级 TTS 合成）, 播放中可随时打断, 多条消息互不串音。


3. **原生级微交互**：完整的历史会话管理（新建对话, 切换, 状态保持与删除逻辑）及现代化, 无侵入的自定义模态弹窗及动效。
4. **可视化 CoT 思维链**：AI 回答支持「可折叠思考过程」与「最终答案」分离展示, 完整还原大模型推理逻辑, 演示观感惊艳。
5. **极简演示机制（无硬编码）**：不依赖死数据, 提供“模板下载 ➔ 手动上传 ➔ 即时问答”的完整可演示闭环, 干净标准, 开箱即用。
6. **全链路自主实现**：从文件解析, 切片, Embedding, 向量检索, Prompt 拼接, 大模型生成到流式输出, 核心链路完全自主掌控, 无黑盒封装。
7. **管理员用量演示页**：可按设备 UUID 查看 Token 与请求统计, 并编辑单设备每日请求上限。当前登录、统计与额度仅为前端 mock 演示, 不提供真实鉴权、服务端限流或持久化；接入生产后需由后端验证管理员并强制执行限额。

---

## ⚙️ 系统核心流程（标准 RAG 架构）

1. **用户上传文档**：支持 `TXT`、`PDF` 格式（`DOCX` 待支持）, 前端完成基础校验与大小过滤, 后端执行纯文本提取。
2. **文本切片与向量化**：长文本自动分块切片, 调用千问 Embedding 接口将其转换为高维稠密向量, 持久化存入 PGVector 向量数据库。
3. **用户语义提问**：用户输入的查询问题同样经过向量化处理, 在向量库中通过余弦相似度精准检索出 Top 3 ~ Top 5 最相关的文档片段。
4. **大模型分析整合**：向量库仅负责召回相关片段, 由千问大模型负责上下文分析, 推理, 信息整合, 组织最终答案, 并输出结构化的 CoT（Chain-of-Thought）思考过程。
5. **SSE 流式输出**：通过服务端单向推送实现“打字机”式的逐字流式渲染, 大幅提升 AI 交互的真实质感。
6. **知识库动态控制**：侧栏可逐份切换文档的启用状态，通过 `PUT /chat/knowledge/files/{id}/enabled` 保存；聊天请求仅发送已启用文档的 ID。后端在普通检索及按文件筛选的检索中排除已停用文档。

---

## 🎬 Demo 演示与体验流程

1. **模板准备**：在侧边栏一键下载业务演示标准模板。
2. **知识入库**：上传 `TXT` 或 `PDF` 格式的私有文档至知识库。
3. **自动处理**：后端自动触发文档解析, 文本切片与向量化入库。
4. **精准问答**：针对文档中的私有业务内容进行提问, AI 实时检索并给出准确回答。
5. **过程审查**：展开查看模型的思考过程（CoT）, 观察流畅的 SSE 流式逐字输出效果。

---

## 📦 快速上手

> **注意**：建议使用 `npm` 进行依赖安装。**尽量不要使用 `pnpm`**，否则可能会因 `node_modules` 目录结构差异导致部分 React Native 依赖包无法正确识别。

```bash
# 1. 安装项目依赖（postinstall 会自动经 patch-package 应用 patches/ 下的补丁）
npm install

# 2. 配置环境变量：复制模板并按需修改
#    EXPO_PUBLIC_API_URL 为后端 API 地址，缺省回退 http://localhost:3000
cp .env.example .env

# 3. 启动
npm run start        # 交互式菜单（Expo Dev Server）
npm run web          # 浏览器端
npm run android      # 安卓（首次自动 prebuild 生成 android/ 工程）
npm run ios          # iOS（需 macOS + Xcode）
```

---

## 📲 CI/CD 与一键打包（GitHub Actions）

`.github/workflows/` 内置三条流水线：

| Workflow | 触发条件 | 做什么 |
| --- | --- | --- |
| `ci.yml` | push / PR → `main` | `tsc --noEmit` 类型检查 + Web 构建冒烟 |
| `cd.yml` | push → `main` | 构建 Web（API 地址取 `vars.API_URL`）并部署到阿里云 |
| `android-release.yml` | Actions 手动触发 / 推 `v*` tag | ABI 分包打 release APK（v7a / arm64 / x86_64）→ 全部分包上传 Artifacts，仅 **arm64-v8a** 覆盖服务器最新包 |

**一键打 release APK**：Actions → `Android APK → Aliyun` → **Run workflow**，`EXPO_PUBLIC_API_URL` 输入框**留空**即可——留空自动回落仓库变量 `API_URL`，填值则仅覆盖本次构建。构建完成后在该次运行的 **Artifacts**（`dietai-agent-apk`）下载 APK，同时服务器上的最新包被覆盖更新。

**仓库配置清单**（Settings → Secrets and variables → Actions）：

| 名称 | 位置 | 说明 |
| --- | --- | --- |
| `API_URL` | Variables | 生产 API 地址：`cd.yml` 构建 Web 与 `android-release.yml` 打包的缺省值 |
| `ALIYUN_HOST`、`ALIYUN_USER`、`SSH_PRIVATE_KEY` | Secrets | Web 部署（`cd.yml`）**必填**，缺任意一个直接失败；打 APK 上传服务器同样依赖 `SSH_PRIVATE_KEY` |
| `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` | Secrets | release 正式签名；**未配置时回退 debug 签名——每次构建签名都不同，无法覆盖安装升级** |
| `ALIYUN_PORT`、`SSH_PORT`、`REMOTE_PATH` | Secrets | 均有默认值，一般无需配置 |

> 不走 CI 也可以本地直出：`npm run android` 会用本机 debug keystore 生成可安装的包。

---

## 📈 商用落地与演进方向

本架构具备支撑中小型企业内部商业化落地的核心能力（如企业内部制度查询, 私有业务知识库, 智能客服等）。若需进一步满足生产级上线要求, 可平滑扩展以下模块：

1. **用户权限隔离**：引入完善的用户体系, 实现文档按 `UserID` 级别的多租户数据隔离。
2. **对象存储集成**：接入 OSS 云存储持久化管理原始文件, 完善文件的全生命周期管理。
3. **RAG 精度优化**：引入 Rerank（重排）模型, 优化切片重叠策略, 有效降低大模型幻觉率。
4. **工程安全加固**：增加 Token 鉴权, 接口限流（Rate Limiting）, Prompt 注入防御及内容安全审核机制。
5. **运维与监控**：建立链路日志采集, 接口性能监控及向量数据库定时备份机制, 保障多用户高并发场景下的稳定性。