'use client'


import { getExchangeManager } from "@/core/chart/market-data/ExchangeManager";
import { Candlestick, ConnectionState, INTERVALMs } from "@/core/chart/market-data/types";
import { UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

export function useCandleSocket(
    symbol: string,
    intervalKey: string,
    onCandle: (c: Candlestick) => void,
    exchange: 'coinbase' | 'binance' | 'kraken' = 'coinbase'
) {
    const currentCandle = useRef<Candlestick | null>(null);
    const lastTime = useRef<number>(0);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionState | null>(null);

    const interval = INTERVALMs[intervalKey];

    useEffect(() => {
        const manager = getExchangeManager();

        const unsubscribeStatus = manager.getConnectionStatus(exchange)(setConnectionStatus);

        const unsubscribeTicker = manager.subscribe(symbol, exchange, (tickerData) => {
            const rounded = Math.floor(tickerData.timestamp / interval) * interval;

            if (!currentCandle.current || rounded !== lastTime.current) {
                currentCandle.current = {
                    time: rounded as UTCTimestamp,
                    open: tickerData.price,
                    high: tickerData.price,
                    low: tickerData.price,
                    close: tickerData.price
                };
                lastTime.current = rounded;
            } else {
                const c = currentCandle.current;
                c.high = Math.max(c.high, tickerData.price);
                c.low = Math.min(c.low, tickerData.price);
                c.close = tickerData.price;
            }

            onCandle({...currentCandle.current});
        })

        return () => {
            unsubscribeStatus();
            unsubscribeTicker();
            currentCandle.current = null;
        };
    }, [symbol, intervalKey, interval, exchange, onCandle]);

    return {connectionStatus}
}