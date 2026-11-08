<div align="center">
<img src="./screenshot/leek-logo.png" alt="韭菜盒子" width="256"/>

# LeekFund

网站：https://leek.fund/

兼容 VS Code 生态编辑器。在你用 AI 专注于写代码的同时，它在后台实时且隐蔽地追踪着市场，绝不打断你的任何工作流。

[![Marketplace](https://vsmarketplacebadges.dev/version/giscafer.leek-fund.jpg?label=Marketplace&style=for-the-badge&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=giscafer.leek-fund)
[![Installs](https://vsmarketplacebadges.dev/installs/giscafer.leek-fund.jpg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=giscafer.leek-fund)
[![Rating](https://vsmarketplacebadges.dev/rating/giscafer.leek-fund.jpg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=giscafer.leek-fund)

投资有风险，入市需谨慎！

</div>


**声明**：本软件仅为数据辅助展示工具，不提供任何投资建议。数据均来自公开网络渠道，因网络延迟或第三方引起的行情误差，本软件不承担法律责任。

## Table of contents

- [功能特性](#功能特性)
- [本地定制版说明（实时快讯面板）](#本地定制版说明实时快讯面板)
- [安装使用](#安装使用)
- [使用文档](#使用文档)


## 功能特性

### 基础功能

- 基金 / 股票 / 期货 / Binance 实时涨跌
- 支持 A 股、港股、美股、国内期货、海外基金、外汇牌价
- 状态栏行情概览
- 基金实时 / 历史走势图、基金排行榜、基金披露持仓信息
- 自定义涨跌颜色与涨跌图标
- 简单版本基金持仓金额、股票成本价维护设置
- 简单版本基金 / 股票盈亏展示
- 股票涨跌提醒配置（IDE 内通知）
- 韭菜中心：基金 / 股票详情、K 线、资金流向等

### LeekFund Pro

- **股票 / 基金自定义分组**：自定义分组、自动展示「我的持仓」分组、分组折叠、分组、个股拖拽排序
- **持仓管理中心（完整）**：总资产、浮动盈亏、编辑 / 加仓 / 删除、账本导入导出
- **市场快讯**：韭菜中心>快讯 + LeekFund News 面板
- **大盘云图**：韭菜中心>大盘云图
- **个性化定制面板**：高级自定义。状态栏股票自选、显示格式、股票收益格式等可视化配置
- **股价预警 Webhook 群推送**（企业微信 / 钉钉 / 飞书）
- **板块行情**：行业 / 概念列表、资金流向、涨幅榜与成分股详情，与大盘云图、自选联动。 [详细文档](https://leek.fund/docs/sector-boards)
- **行情中继**：Pro 用户可在自建服务器部署代理，将股票 / 基金行情请求转至个人中继，应对内网拦截证券 API 或高频监测； [详细文档](https://leek.fund/docs/market-data-relay)
- **LeekAgent**：进行快讯摘要、自选 / 持仓概览、标的公开信息解读。 [详细文档](https://leek.fund/docs/leek-agent)
- **编辑器 Blame 伪装**：在代码文件中以 Git 提交日志样式私密查看持仓股票行情


## 本地定制版说明（实时快讯面板）

> 本仓库是个人 fork，基于 `LeekHub/leek-fund` 3.24.0 二次开发，新增了常驻的实时快讯面板。
> 如果你只需要官方功能，请安装 [Marketplace 版本](https://marketplace.visualstudio.com/items?itemName=giscafer.leek-fund)。

### 新增功能

- **常驻实时快讯面板**：VS Code 启动时自动在编辑器旁打开，也可从 `Settings` 视图或命令面板「打开实时快讯面板」进入。
- **多数据源标签切换**：金十、财联社、东方财富、同花顺、华尔街见闻、选股宝，顶部标签可单独筛选，另有「重要」开关和关键词搜索。
- **消息只保留 1 小时**：过期自动清理，最多保留 300 条（`leek-fund.flashNewsPanel.maxItems` 可调）。
- **只显示中文快讯**：外文快讯直接丢弃，不做翻译。
- **状态提示**：标题旁圆点表示数据状态，10 分钟内收到过数据为绿色，超过 10 分钟为黄色「等待更新」。

### 数据源实现说明

| 源 | 接口 | 鉴权 |
| --- | --- | --- |
| 金十 | `https://www.jin10.com/flash_newest.js`（HTTP 轮询 + ETag） | 无 |
| 财联社 | `https://www.cls.cn/v1/roll/get_roll_list` | 公开网页签名算法 |
| 东方财富 | `https://np-listapi.eastmoney.com/comm/web/getFastNewsList` | 无 |
| 同花顺 | `https://news.10jqka.com.cn/tapp/news/push/stock/` | 无 |
| 华尔街见闻 | `https://api-one.wallstcn.com/apiv1/content/lives` | 无 |
| 选股宝 | `https://baoer-api.xuangubao.com.cn/api/v6/message/newsflash` | 需要登录 Token |

> 金十原先的 WebSocket 已改为加密协议，旧版明文解析失效，因此本项目改为轮询其网页公开快照接口，并通过 `If-None-Match` 在内容未变化时获取 304，避免重复下载。

### 相关设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `leek-fund.flashNewsPanel.autoOpen` | `true` | 启动时自动打开实时快讯面板 |
| `leek-fund.flashNewsPanel.maxItems` | `300` | 面板最多保留的消息条数 |
| `leek-fund.xgbToken` | 空 | 选股宝 Token，也可在「AI 配置管理」页面填写 |

选股宝 Token 获取：浏览器登录 [xuangubao.cn](https://xuangubao.cn)，F12 → Application → Local Storage → 复制 `XGB_PC_PROD_TOKEN` 的值。留空时选股宝标签为空，轮询自动降频。

### 其他修复

- 修复 `FlashNewsDaemon` 回放缓存时会反转原数组的问题。
- 修复关闭再打开快讯后重复创建 WebSocket / 轮询服务的问题。
- 修复金十去重集合无限增长的问题。
- 快讯缓存容量从 100 提升到 1000，避免多个数据源的首屏数据互相挤掉。
- 快讯面板改为在扩展激活早期打开，不再受本地行情代理服务启动速度影响。
- 侧边栏新闻视图重命名为「韭菜新闻」，并在 `Settings` 视图增加入口。

### 构建与安装

```bash
yarn install
yarn compile          # 编译扩展 + 构建 leek-center 前端
npx vsce package --yarn -o ./
code --install-extension leek-fund-3.24.0.vsix --force
```

仓库根目录也提交了打包好的 `leek-fund-3.24.0.vsix`，可直接安装。

> 注意：安装本地 VSIX 会覆盖 Marketplace 上的 `giscafer.leek-fund`（版本号相同）。之后 Marketplace 自动更新可能会覆盖本定制版，需要重新安装 VSIX。

## 安装使用

安装插件：[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=giscafer.leek-fund)

| 要求 | 版本 |
|------|------|
| VS Code | `^1.100.0` |
| Cursor | `^3.0.0` |

## 使用文档

- [在线功能介绍](https://leek.fund/docs/getting-started)
- [行情中继（Pro）](https://leek.fund/docs/market-data-relay)

<!-- https://raw.staticdn.net/ 为GitHub raw 加速地址 -->

![概览](./screenshot/overview.png)

### 资产管理

![资产管理](./screenshot/helding.png)

### 大盘云图
![大盘云图](./screenshot/dapanyuntu.png)

### 板块行情

![板块行情](./screenshot/bkhq.png)

![板块行情](./screenshot/bkhq2.png)

### 个股异动

![个股异动](./screenshot/geguyidong.png)

### Blame 伪装
编辑器 Blame 伪装，相比状态栏与侧边栏查看行情信息更加隐蔽

> 文件头部

![Blame伪装](./screenshot/blame2.png)

> 文件git message。持仓多只股时，鼠标光标依次换行点击即可轮播查看不同持仓股

![Blame伪装](./screenshot/blame.png)


自定义配置在 **Settings** 视图下（Pro 用户可使用可视化个性化定制）：

![](./screenshot/settings.png)

![](./screenshot/setting-stock.png)


## All Thanks To Our Contributors

<a href="https://github.com/LeekHub/leek-fund/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=LeekHub/leek-fund" />
</a>


## License

[LICENSE](./LICENSE)


