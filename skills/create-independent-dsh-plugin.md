---
name: create-independent-dsh-plugin
description: 创建绝对独立的 dsh（DeepSeek Harness）插件并安装进 profile。覆盖 bundle 目录结构、工具/事件/配置插件模板、dsh plugin add 安装与验证。适用于给本机 dsh web 部署（dsh-web.service）添加自定义功能。
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [dsh, deepseek-harness, plugin, cordis, bundle]
    related_skills: [service-deployment]
---

# 创建独立 dsh 插件 (create-independent-dsh-plugin)

## 触发条件

用户要求给 dsh（DeepSeek Harness）添加新功能、创建自定义插件、给 web 部署加工具/事件/界面能力时使用。参考实现：`/home/tomorrow285/deepseek-harness`（tag `dsh-v0.1.1-rc.1`），官方文档 `docs/user/develop/basic/{index,tool,config,publish}.md`。

## 两条铁律（本 skill 专属约定，必须遵守）

### 铁律 1：不写任何"消除副作用"的清理代码

Cordis 框架会自动清理插件通过 `ctx` 注册的一切（工具、事件监听、定时器、服务）。因此：

- **禁止**生成 `ctx.effect(() => ... return () => ...)` disposer、`removeListener`、`clearInterval` 等手动清理代码。
- **禁止**在 apply 里做资源清理设计，不要为"卸载时怎么办"增加思考负担。
- 需要定时器时用 `ctx.setInterval` / `ctx.setTimeout`（自动清理），不要用全局 `setInterval`。
- 需要监听时用 `ctx.on(...)`（自动清理）。
- apply 保持简单直接：注册完就返回。

### 铁律 2：插件绝对独立，零第三方依赖

- **只能**依赖 dsh 自带的 `@deepseek-ai/*` 内置包（如 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`），且只作为 **peerDependencies**（由 harness 提供，插件自己不安装）。
- **禁止**依赖任何第三方插件包：`@dsh-external/*`、社区插件、其他用户的插件、npm 上非 deepseek-ai 的运行时包。
- **禁止** import 其他插件的服务或共享代码。插件是自包含的独立单元。
- 工具类能力一律通过本插件自己的 `defineTool` + `ctx.tools.register` 提供，不借用别人的注册。

## 核心概念（白话版）

- **插件** = 一个 TypeScript 模块，named-export `apply(ctx)` 函数。框架加载时调用它，`ctx` 就是注册一切的入口。
- **Bundle** = 一个 npm 包，用 `dsh.bundle` 声明自己贡献一个配置层（`cordis.patch.yml`）。这是我们编写和分发的单位。
- **Profile** = `$DSH_HOME/profiles/<name>` 目录，描述"哪些 bundle 按什么顺序组成一个可运行应用"。由 `dsh plugin` 命令维护，不要手写。
- **安装** = 把 bundle 加进 profile 的依赖 + bundles 列表。

## 标准项目结构

开发目录是 pnpm monorepo（GitHub: `tomorrow285/my-dsh-plugins` → 本地 `~/my_dsh_plugins/`），
每个插件是 `packages/` 下的独立包：

```
/home/tomorrow285/my_dsh_plugins/      ← monorepo 根（已 clone 自 GitHub）
├── pnpm-workspace.yaml                # packages: 'packages/*'
├── package.json                       # pnpm@11 monorepo 脚本（build/typecheck/verify）
├── tsconfig.base.json
└── packages/
    └── <plugin-name>/                 ← 新插件在这里建目录
        ├── package.json        # 声明 dsh.bundle（必填）
        ├── cordis.patch.yml    # 配置层：插入插件行
        ├── tsconfig.json       # TS 编译配置
        ├── tsdown.config.ts    # 构建配置（tsdown 打包 node + client 双产物）
        └── src/
            └── index.ts        # 插件源码（named-export apply）
```

已存在的插件（2026-08）：`dsh-simple-password`（host 密码门禁）、`dsh-ui-history`（client）、
`dsh-ui-toc`（client）。新插件一律加进 `packages/` 并遵守 monorepo 约定：`pnpm -r build`
全量构建、`dsh plugin add ./packages/<name>` 安装。单插件快速原型可照 Step 5 的简化 tsconfig，
但进仓库的插件用 tsdown（client 插件必须，host 插件也可以——看现有包的 tsdown.config.ts 抄）。

## 步骤

### 1. 建目录

```bash
mkdir -p /home/tomorrow285/my_dsh_plugins/<plugin-name>/src
cd /home/tomorrow285/my_dsh_plugins/<plugin-name>
```

### 2. 写插件源码 `src/index.ts`

用下面的模板（工具 / 配置 / 事件），照抄结构即可。

### 3. 写 `package.json`

```json
{
  "name": "dsh-<plugin-name>",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0"
  }
}
```

要点：
- `dsh.bundle.patch` 指向配置层文件，**必须有**，否则包只能当普通依赖，`dsh plugin` 会警告且不激活任何层。
- peerDependencies 版本范围要匹配本机已安装的 dsh CLI（已升级到 v0.1.1-rc.1，但插件 peer 范围仍写 `^0.1.0-rc.6`——caret 范围兼容 rc.6→rc.1，与 `@dsh-external/dsh-mobile-nav` 一致）。只列真正 import 的包。
- 只用内置包 → 不产生第三方依赖（铁律 2）。

### 4. 写 `cordis.patch.yml`

```yaml
- insert:
    - id: <plugin-name>
      name: dsh-<plugin-name>
```

**`name` 必须写包名**（Node 从 profile 的 node_modules 解析），不是相对源码路径。相对/绝对路径只用于临时 `--patch` overlay 加载。

### 5. 写 `tsconfig.json` 并构建

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "lib",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

```bash
pnpm install
pnpm build   # 产出 lib/index.js + lib/index.d.ts
```

单文件插件没有相对导入，NodeNext 规则不会造成麻烦。若以后拆多个文件，相对导入必须带 `.js` 后缀。

### 6. 安装到 profile

```bash
export DSH_HOME=/home/tomorrow285/.dsh   # 必填！见坑 1
cd /home/tomorrow285/my_dsh_plugins
dsh plugin --profile web add ./<plugin-name>
```

多个插件一次安装（monorepo 根目录、一个 pnpm 调用）：

```bash
dsh plugin --profile web add ./packages/dsh-a ./packages/dsh-b ./packages/dsh-c
```

首次 add 会初始化 profile（自动带上 `@deepseek-ai/dsh-base`），pnpm 以 `link:` 协议链接本地目录，`dsh` 自动把 bundle 追加到 `dsh.profile.bundles`。**装完立刻 diff profile 的 package.json**（坑 9）：确认既有插件和 bundles 都没被替换掉。

### 7. 验证

```bash
export DSH_HOME=/home/tomorrow285/.dsh
dsh --profile web --dump-config | grep -B2 -A4 '<plugin-name>'   # 应看到新层
sudo systemctl restart dsh-web.service
journalctl -u dsh-web.service -n 100 | grep -i -E 'error|fail'    # 无报错
```

功能验证：打开 http://127.0.0.1:3080（外网经 nginx 3081 反代），让模型调用新工具 / 触发新行为。

移除：`dsh plugin --profile web remove dsh-<plugin-name>`（同时移除依赖和层）。

## 代码模板

### 模板 A：工具插件（最常见）

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = '<plugin-name>'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: '<tool_name>',
    description: '<给模型看的工具描述，说明何时调用、参数含义>',
    parameters: {
      city: { type: 'string', required: true, description: '城市名' },
      days: { type: 'number', description: '天数，默认 3' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      // args 已被 schema 校验并推导类型：{ city: string; days?: number }
      // 返回 output.schema 声明的规范值，别返回 Markdown 或内容块
      return `...`
    },
  }))
}
```

- `inject: ['tools']` 让框架等工具注册表就绪后再加载。
- `execute` 返回规范 JSON 值，`output.render` 负责转成模型可见内容。
- 抛错 = 工具失败（isError）；业务结果放进返回值。

### 模板 B：带配置的插件

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = '<plugin-name>'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  // config 已被 schema 校验并填好默认值
  console.log(config.greeting)
}
```

- 必须导出 Schemastery `Config`，**不能**导出普通对象，否则 Cordis 无法校验。
- 可调值都要做成配置字段（判断标准：cordis.yml 能否不改代码就改这个值）。

### 模板 C：事件监听插件

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = '<plugin-name>'

export function apply(ctx: Context) {
  ctx.on('<event-name>', (payload) => {
    // 事件名以框架/服务实际暴露的为准，不要凭空发明
  })
}
```

事件监听用 `ctx.on`，卸载自动移除，不需要手动 off（铁律 1）。

### 模板 D：纯前端 UI 插件（可选进阶）

参考 `@dsh-external/dsh-mobile-nav`：node 侧 `apply` 留空函数（占位让行存在），浏览器半区经 `package.json` 的 `dsh.client` 声明 + `exports["./client"]` 导出。仅当需要改 web UI 时才用这个形态。

## 常见坑

1. **DSH_HOME 必须显式 export**：本机 dsh 部署在 `/home/tomorrow285/.dsh`（systemd 服务用）。任何 dsh 操作前先 `export DSH_HOME=/home/tomorrow285/.dsh`（2026-08 已核实全盘仅此一份；`~/.hermes/home/.dsh` 旧副本早已不存在，但 shell 的 `$HOME` 会解析到 `~/.hermes/home`，不 export 会指错位置）。
2. **GitHub 安装的构建陷阱**：`dsh plugin add github:user/repo` 拉的是源码不是构建产物，TypeScript 包会因缺 `lib/` 加载失败。作者侧需 `prepare` 脚本（git 安装后 pnpm 会跑），用户侧需在 profile 的 `pnpm-workspace.yaml` 加 `allowBuilds` 白名单（pnpm ≥10 默认拒绝 git 依赖的 prepare）。**本地 `add ./目录` 无此问题**，是本机开发的推荐方式。信任问题：allowBuilds = 允许在安装时执行该包代码，只允许可信来源，并 pin commit sha。
3. **官方 tag 前缀是 `dsh-`**：如 `dsh-v0.1.1-rc.1`，不是 `v0.1.1-rc.1`。
4. **函数插件用 named-export，不要 default export**：default export 会让 Loader 丢弃插件的 `inject`/`Config` 命名空间（见仓库 postmortem 0001）。照模板写 `export const name/inject/Config` + `export function apply`。
5. **patch 覆盖是整行替换，不深合并**：覆盖既有行（按 `id`）必须重述该行需要的所有 key。
6. **注册即副作用**：所有贡献都走 `ctx.*` 注册（`ctx.tools.register`、`ctx.on`、`ctx.effect`），返回的 disposer 由框架持有。不要自己存全局注册表。
7. **依赖服务必须 inject**：`export const inject = ['tools']` 等，框架会等待服务就绪；不要用 `ctx.get()` 代替声明式注入（除非可选服务）。
8. **peerDeps 版本匹配**：本机 dsh CLI 是 0.1.1-rc.1；插件 peerDependencies 用 `^0.1.0-rc.6`（与 dsh-mobile-nav 一致，caret 范围兼容 rc.6→rc.1），不要写成仓库源码里的 `workspace:^` 或裸 `0.1.1-rc.1`。
9. **`dsh plugin add` 的追加/替换行为已核实**：dsh 0.1.1-rc.1 下用本地 `link:` 路径一次 add 多个包是**追加**（实测 3 个插件一次装好，`@dsh-external/dsh-mobile-nav` 完好保留）；但旧版 0.1.0-rc.6 + `github:` spec 曾观测到**替换**整个依赖列表。无论哪种情况，add 之后必须 diff profile 的 `package.json`（`dependencies` + `dsh.profile.bundles` 两处），确认既有插件没丢。
10. **SPA 深链接刷新 404 白屏**：dsh 的 frontend-static fallback 没有 SPA history fallback——非文件路径一律空 404，客户端 JS 根本没机会加载。做 URL 镜像类 client 插件（`/chat/{id}`、`/w/{wid}/chat/{id}` 这种）必须在 node 半区注册 webserver prefix 路由兜底（内部 fetch 根路径渲染 index.html、URL 不变、非本插件形状保持 404）。完整机制 + 可抄代码：`references/spa-deep-link-404-fix.md`。
11. **webServer 路由表是组合层契约**：`register({kind, path, handler})` 重复 (kind,path) 直接 throw；fallback 是单座位（frontend-static 已占）。`/api`、`/plugins`、HMR/retention 的 exact 端点已被内置占用，`/chat`、`/w` 空闲可注册。查占用：`grep -rn 'webServer.register' <dsh包>/node_modules/@deepseek-ai/*/lib/index.js`。
12. **权限预设（"不弹窗全放行"模式）**：dsh 权限 = sandbox 模式 × approval 策略两个旋钮。`approval: never` 是**自动拒绝**（fail-closed）不是放行；真正不弹窗的做法是把 sandbox 钉在 `danger-full-access`（阶梯顶点，无升级目标 → 审批永不触发）。在 profile 覆盖层 `cordis.patch.yml` 覆盖 `permission` 行加自定义预设（如 god-mode），**必须重述全部预设**（整行替换不深合并）。切换：`/permission <name>` 或 UI 选择器。完整模型 + 配方 + 验证：`references/permission-presets.md`。

## 验证清单

- [ ] 目录在 `/home/tomorrow285/my_dsh_plugins/<plugin-name>/`，结构完整（package.json + cordis.patch.yml + src/）
- [ ] package.json 有 `dsh.bundle.patch`，peerDependencies 只有 `@deepseek-ai/*` 内置包
- [ ] 源码无任何 `ctx.effect` / 手动清理 / 第三方包 import
- [ ] `pnpm build` 通过，产出 `lib/`
- [ ] `export DSH_HOME=/home/tomorrow285/.dsh && dsh plugin --profile web add ./<plugin-name>` 成功，profile 的 bundles 列表出现新包
- [ ] `dsh --profile web --dump-config` 能看到新层
- [ ] `sudo systemctl restart dsh-web.service` 后 journalctl 无报错
- [ ] client 插件的前端清单验证：`curl --noproxy '*' -s http://127.0.0.1:3080/ | grep -o '__DSH_BOOT__[^;]*'` 应包含插件 id；`curl -I http://127.0.0.1:3080/plugins/<id>/client.js` 返回 200。**scoped 包名 URL 要带 @scope 前缀**（如 `/plugins/@dsh-external/dsh-mobile-nav/client.js`），用裸名探测 404 不代表失败
- [ ] 在 web UI（http://127.0.0.1:3080）实测模型能调用工具 / 行为生效
