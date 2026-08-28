---
name: market-prices
description: 查询 A 股/指数、国内期货、外盘原油、比特币的实时价格（免费 API，无需 key）。含上证指数/上证50 的 MA60/MA120 均线计算，自动追加 CSV 记录。数据源：新浪财经 hq.sinajs.cn + 新浪日K线 + Binance/CoinGecko。
metadata:
  hermes:
    related_skills: [ptrade-backtesting]
---

# Market Prices（实时行情查询）

查询中国股市（A股/指数）、国内期货主力连续、国际原油、比特币的实时价格，并记录 CSV。

## 触发场景

- 用户要查股票/期货/指数/比特币的实时价、涨跌幅
- 用户要上证指数/上证50 的 60 日、120 日均线
- 每日定时行情播报、行情记录 CSV

## 数据源（研究结论，全部免费无 key）

来自 stock-bar 项目（github.com/Chef5/stock-bar）源码分析 + 实测验证：

| 数据 | API | 说明 |
|---|---|---|
| A股/指数/国内期货/外盘原油/比特币期货 | `https://hq.sinajs.cn?list=代码1,代码2,...` | **必须带 `Referer: https://finance.sina.com.cn` 头**，响应是 **GBK 编码**（要用 gbk 解码），格式 `var hq_str_xxx="字段,...";`，一行一个代码 |
| 指数日K线（算均线） | `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=sh000001&scale=240&ma=no&datalen=130` | 返回 JSON 数组 `[{day, open, high, low, close, volume}]`，旧→新 |
| 比特币现货 | `https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT` | 直连可用；备选 `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`；再备选新浪 `hf_BTC`（CME 期货价） |

### 新浪代码格式与字段下标

- 股票/指数：`sh` 沪 / `sz` 深 + 6 位代码（上证指数 `sh000001`、上证50 `sh000016`、比亚迪 `sz002594`）。字段：`[0]名称 [1]今开 [2]昨收 [3]现价 [4]最高 [5]最低`
- 国内期货主力连续：`nf_` + 品种代码 + `0`（**不是年份合约**）。字段：`[0]名称 [8]现价 [10]昨结`
- 外盘期货：`hf_` + 品种代码。字段：`[0]现价 [7]昨收 [13]名称`

### 品种代码速查

| 品种 | 新浪代码 | 类型 |
|---|---|---|
| 上证指数 | sh000001 | a |
| 上证50 | sh000016 | a |
| 比亚迪 | sz002594 | a |
| 焦煤主连 | nf_JM0 | nf |
| 生猪主连 | nf_LH0 | nf |
| 黄金主连 | nf_AU0 | nf |
| 原油主连(上期所SC) | nf_SC0 | nf |
| 美原油主连(NYMEX WTI) | hf_CL | hf |
| 布伦特原油主连 | hf_OIL | hf |
| 比特币 | Binance BTCUSDT（备选 hf_BTC） | — |

## 用法

```bash
# 查询 + 追加 CSV + 打印汇总（默认路径 /home/tomorrow285/market-prices/prices.csv）
python3 ~/.hermes/skills/quant/market-prices/scripts/fetch_prices.py

# 指定 CSV 路径 / 只查不写
python3 .../fetch_prices.py --csv /path/to.csv
python3 .../fetch_prices.py --no-append
```

输出示例：

```
📊 2026-08-28 实时行情
品种              现价       涨跌幅      MA60     MA120   源
上证指数       3952.18    -0.11%   3957.86   4008.53   新浪
...
比特币        79189.02        --        --        --   Binance
```

## CSV 记录

- 位置：`/home/tomorrow285/market-prices/prices.csv`（每日追加一行，utf-8-sig 编码 Excel 友好）
- 列：日期 + 每个品种的现价/涨跌幅，上证指数和上证50 额外含 MA60/MA120，比特币含数据源
- 脚本幂等：已存在则追加，不存在则建表头

## 均线算法说明

- 从新浪日K取最近 130 个交易日收盘价，MA60/MA120 = 最近 60/120 根收盘均值
- 若 K 线最后一根不是今天（盘中/刚收盘时数据未更新），自动把今天的实时价当作今天的收盘价补进去再算

## 坑与注意

- **新浪接口必须带 Referer 头**（否则 403 拒绝）；响应 GBK 编码，直接 UTF-8 解码中文会乱码
- **`hf_` 外盘字段与 `nf_`/股票不同**：外盘现价在字段 0，昨收在字段 7
- **shell $HOME 陷阱**：本机 Hermes 环境 `$HOME` 可能解析为 `~/.hermes/home`，脚本里 CSV 路径务必写固定绝对路径，不要用 `os.path.expanduser("~")`
- 国内期货品种代码主连统一 `nf_XX0`（如 `nf_CL0` 不存在，上海原油是 `nf_SC0`）
- 新浪外盘行情量很薄（几手），现价跳动正常；比特币优先用 Binance 现货，新浪 `hf_BTC` 是 CME 期货价，两者有偏差
- 脚本退出码非 0 表示有品种获取失败（stderr 里有 warn），cron 可据此触发告警
