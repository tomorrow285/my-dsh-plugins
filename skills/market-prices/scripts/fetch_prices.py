#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
实时行情查询脚本（market-prices skill）
=========================================
数据源（全部免费、无需 API key）：
  1. 新浪财经 hq.sinajs.cn  —— A股/指数/国内期货/外盘原油/比特币期货实时价（GBK 编码，需 Referer 头）
  2. 新浪日K线 API          —— 指数日线收盘价，用于计算 MA60 / MA120
  3. Binance / CoinGecko    —— 比特币现货价（多级回退；两个都挂了再退回新浪 CME 期货价）

用法：
  python3 fetch_prices.py            # 查询并追加 CSV，打印汇总
  python3 fetch_prices.py --csv PATH # 指定 CSV 路径（默认 ~/market-prices/prices.csv）
  python3 fetch_prices.py --no-append # 只查询不写 CSV
"""
import argparse
import csv
import datetime
import json
import os
import statistics
import sys
import urllib.request

SINA_HEADERS = {
    "Referer": "https://finance.sina.com.cn",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
}

# 品种表: (显示名, 新浪代码, 类型)
#   类型 a  = A股/指数 (sh/sz)  现价=字段3, 昨收=字段2
#   类型 nf = 国内期货主力连续  现价=字段8, 昨结=字段10
#   类型 hf = 外盘期货          现价=字段0, 昨收=字段7
SYMBOLS = [
    ("上证指数", "sh000001", "a"),
    ("上证50", "sh000016", "a"),
    ("比亚迪", "sz002594", "a"),
    ("焦煤主连", "nf_JM0", "nf"),
    ("生猪主连", "nf_LH0", "nf"),
    ("黄金主连", "nf_AU0", "nf"),
    ("原油主连", "nf_SC0", "nf"),
    ("美原油主连", "hf_CL", "hf"),
    ("布伦特原油主连", "hf_OIL", "hf"),
]

# 需要计算均线的品种 -> 新浪K线代码
MA_SYMBOLS = {"上证指数": "sh000001", "上证50": "sh000016"}
MA_WINDOWS = (60, 120)

# 固定绝对路径：shell 的 $HOME 可能解析到 ~/.hermes/home，避免 CSV 落错目录
DEFAULT_CSV = "/home/tomorrow285/market-prices/prices.csv"


def http_get(url, headers=None, decode="utf-8", timeout=15):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw.decode(decode, errors="replace")


def fetch_sina_quotes(symbols):
    """批量获取新浪实时行情 -> {新浪代码: 字段数组}"""
    url = "https://hq.sinajs.cn?list=" + ",".join(s for _, s, _ in symbols)
    text = http_get(url, SINA_HEADERS, decode="gbk")
    out = {}
    for line in text.strip().splitlines():
        if "=" not in line:
            continue
        var, val = line.split("=", 1)
        sym = var.strip().replace("var hq_str_", "")
        out[sym] = val.strip().strip(";").strip('"').split(",")
    return out


def parse_price(kind, fields):
    """按类型解析实时价 -> (现价, 昨收/昨结, 涨跌幅%)"""
    try:
        if kind == "a":
            price, pre = float(fields[3]), float(fields[2])
        elif kind == "nf":
            price, pre = float(fields[8]), float(fields[10])
        elif kind == "hf":
            price, pre = float(fields[0]), float(fields[7])
        else:
            return None, None, None
        pct = (price - pre) / pre * 100 if pre else 0.0
        return price, pre, pct
    except (ValueError, IndexError):
        return None, None, None


def fetch_kline(symbol, datalen=130):
    """新浪日K线 -> [(日期, 收盘价)]，旧→新"""
    url = (
        "https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData"
        f"?symbol={symbol}&scale=240&ma=no&datalen={datalen}"
    )
    text = http_get(url, SINA_HEADERS)
    data = json.loads(text)
    return [(d["day"], float(d["close"])) for d in data]


def calc_ma(closes, n):
    if len(closes) < n:
        return None
    return round(statistics.mean(closes[-n:]), 2)


def fetch_btc():
    """比特币现货：Binance -> CoinGecko -> 新浪 CME 期货，逐级回退"""
    try:
        data = json.loads(http_get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"))
        return float(data["price"]), "Binance"
    except Exception:
        pass
    try:
        data = json.loads(http_get(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"))
        return float(data["bitcoin"]["usd"]), "CoinGecko"
    except Exception:
        pass
    try:
        quotes = fetch_sina_quotes([("比特币", "hf_BTC", "hf")])
        fields = quotes.get("hf_BTC", [])
        if fields and fields[0]:
            return float(fields[0]), "新浪(CME期货)"
    except Exception:
        pass
    return None, None


def main():
    parser = argparse.ArgumentParser(description="实时行情查询（新浪+Binance/CoinGecko）")
    parser.add_argument("--csv", default=DEFAULT_CSV, help="CSV 保存路径")
    parser.add_argument("--no-append", action="store_true", help="只查询不写 CSV")
    args = parser.parse_args()

    today = datetime.date.today().isoformat()
    results = {}  # 名称 -> {price, pct, ma60, ma120, source}

    # 1) 新浪实时行情
    quotes = fetch_sina_quotes(SYMBOLS)
    for name, sym, kind in SYMBOLS:
        fields = quotes.get(sym, [])
        price, pre, pct = parse_price(kind, fields)
        results[name] = {"price": price, "pct": pct, "ma60": None, "ma120": None, "source": "新浪"}

    # 2) 指数均线（若最后一根K线不是今天，则把今天实时价当收盘价补上）
    for name, kline_sym in MA_SYMBOLS.items():
        try:
            klines = fetch_kline(kline_sym)
            closes = [c for _, c in klines]
            if klines and klines[-1][0] != today and results[name]["price"]:
                closes.append(results[name]["price"])
            results[name]["ma60"] = calc_ma(closes, 60)
            results[name]["ma120"] = calc_ma(closes, 120)
        except Exception as e:
            print(f"[warn] {name} 均线获取失败: {e}", file=sys.stderr)

    # 3) 比特币
    btc_price, btc_src = fetch_btc()
    if btc_price:
        results["比特币"] = {"price": btc_price, "pct": None, "ma60": None, "ma120": None, "source": btc_src}

    # 输出汇总
    fail = [n for n, r in results.items() if not r["price"]]
    print(f"📊 {today} 实时行情")
    print("-" * 74)
    print(f"{'品种':<14}{'现价':>12}{'涨跌幅':>10}{'MA60':>10}{'MA120':>10}   源")
    print("-" * 74)
    for name, r in results.items():
        if not r["price"]:
            print(f"{name:<14}{'--':>12}  获取失败")
            continue
        pct = f"{r['pct']:+.2f}%" if r["pct"] is not None else "--"
        ma60 = f"{r['ma60']:.2f}" if r["ma60"] else "--"
        ma120 = f"{r['ma120']:.2f}" if r["ma120"] else "--"
        print(f"{name:<14}{r['price']:>12.2f}{pct:>10}{ma60:>10}{ma120:>10}   {r['source']}")
    print("-" * 74)

    if fail:
        print(f"[warn] 以下品种获取失败: {', '.join(fail)}", file=sys.stderr)

    # 写 CSV
    if not args.no_append:
        os.makedirs(os.path.dirname(args.csv) or ".", exist_ok=True)
        header = ["日期", "上证指数", "上证指数涨跌%", "上证指数MA60", "上证指数MA120",
                  "上证50", "上证50涨跌%", "上证50MA60", "上证50MA120",
                  "比亚迪", "比亚迪涨跌%",
                  "焦煤主连", "焦煤主连涨跌%", "生猪主连", "生猪主连涨跌%",
                  "黄金主连", "黄金主连涨跌%", "原油主连", "原油主连涨跌%",
                  "美原油主连", "美原油主连涨跌%", "布伦特原油主连", "布伦特原油主连涨跌%",
                  "比特币", "比特币涨跌%", "比特币源"]
        row = [today]
        for name in ["上证指数", "上证50", "比亚迪", "焦煤主连", "生猪主连", "黄金主连",
                     "原油主连", "美原油主连", "布伦特原油主连", "比特币"]:
            r = results.get(name, {})
            row.append(f"{r['price']:.2f}" if r.get("price") else "")
            row.append(f"{r['pct']:+.2f}" if r.get("pct") is not None else "")
            if name in MA_SYMBOLS:
                row.append(f"{r['ma60']:.2f}" if r.get("ma60") else "")
                row.append(f"{r['ma120']:.2f}" if r.get("ma120") else "")
            if name == "比特币":
                row.append(r.get("source", ""))
        new_file = not os.path.exists(args.csv)
        with open(args.csv, "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            if new_file:
                writer.writerow(header)
            writer.writerow(row)
        print(f"✅ 已记录到 {args.csv}")

    return 0 if not fail else 1


if __name__ == "__main__":
    sys.exit(main())
