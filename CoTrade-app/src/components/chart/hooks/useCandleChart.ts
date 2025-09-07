'use client'

import { useEffect, useRef, useCallback, useState } from "react";
import {
    IChartApi,
    createChart,
    CandlestickSeries,
    ISeriesApi,
    SeriesType,
    UTCTimestamp,
} from "lightweight-charts";
import { ThemeConfig } from "@/constants/theme";
import { useChartInteractions } from "./useChartInteractions";
import { useCandleSocket } from "./useCandleSocket";
import { Candlestick, INTERVALMs } from "@/core/chart/market-data/types";
import { useApp } from "../context";


export async function fetchHistoricalCandles(ticker: string, timeframe: string, numBars: number): Promise<Candlestick[]> {
    const now = Math.floor(Date.now() / 1000);
    const interval = INTERVALMs[timeframe];
    const start = now - numBars * interval;
    const url = `http://localhost:8080/candles?symbol=${ticker}&timeframe=${timeframe}&start=${start}&end=${now}`;
    const raw: number[][] = await fetch(url).then(res => res.json());
    return raw.map(([time, low, high, open, close]) => ({ time: time as UTCTimestamp, open, high, low, close }));
}

export function useCandleChart(
    containerRef: React.RefObject<HTMLDivElement | null>,
) {
    const { state, action } = useApp();
    const { symbol, timeframe } = state.chart.data
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const [chartInitialized, setChartInitialized] = useState(false);

    const candleCache = useRef<Map<number, Candlestick>>(new Map());

    const normalizedTimeframe = timeframe || '1D';

    const updateChart = useCallback((candle: Candlestick) => {
        if (!seriesRef.current) return;
        candleCache.current.set(candle.time, candle)
        seriesRef.current.update({ ...candle, time: candle.time as UTCTimestamp });
    }, []);

    useCandleSocket(symbol, timeframe, updateChart);

    useEffect(() => {
        candleCache.current.clear();
    }, [symbol, timeframe])

    const loadHistoricalCandles = useCallback(async (numBars: number) => {
        try {
            const candles = await fetchHistoricalCandles(
                symbol,
                timeframe,
                numBars
            )

            candles.forEach(candle => {
                candleCache.current.set(candle.time, candle);
            });

            const sortedCandles = Array.from(candleCache.current.values())
                .sort((a, b) => (a.time) - (b.time));

            setTimeout(() => {
                if (seriesRef.current) {
                    seriesRef.current.setData(sortedCandles);
                    setChartInitialized(true);
                }
            }, 250)
        } catch (error) {
            console.error(`Error fetching candles: `, error)
        }
    }, [symbol, timeframe])

    const safeCleanup = useCallback(() => {
        try {
            if (resizeObserverRef.current) {
                if (containerRef.current) {
                    resizeObserverRef.current.unobserve(containerRef.current);
                }
                resizeObserverRef.current.disconnect();
                resizeObserverRef.current = null;
            }
            if (chartRef.current) {
                chartRef.current.remove();
            }
        } catch (error) {
            console.error('Error during chart cleanup:', error);
        } finally {
            chartRef.current = null;
            seriesRef.current = null;
            setChartInitialized(false);
            candleCache.current.clear()
        }
    }, [containerRef]);

    useEffect(() => {
        safeCleanup();
        if (!containerRef.current) return;

        try {
            const chart = createChart(containerRef.current, {
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight,
                layout: state.chart.settings.background.theme === 'light' ? ThemeConfig.light : ThemeConfig.dark,
                crosshair: { mode: state.chart.cursor },
                grid: {
                    vertLines: state.chart.settings.background.grid.vertLines,
                    horzLines: state.chart.settings.background.grid.horzLines
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: normalizedTimeframe === '1m',
                    tickMarkFormatter: (time: number) => {
                        const date = new Date(time * 1000);
                        return (normalizedTimeframe === '1D' || normalizedTimeframe === '1W')
                            ? date.toLocaleDateString()
                            : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                },
                localization: {
                    timeFormatter: (time: number) => {
                        const date = new Date(time * 1000);
                        return date.toLocaleString([], {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit', hour12: false
                        });
                    }
                }
            });

            const series = chart.addSeries(CandlestickSeries, {
                upColor: state.chart.settings.candles.upColor,
                downColor: state.chart.settings.candles.downColor,
                borderVisible: state.chart.settings.candles.borderVisible,
                wickUpColor: state.chart.settings.candles.wickupColor,
                wickDownColor: state.chart.settings.candles.wickDownColor,
            });



            chartRef.current = chart;
            seriesRef.current = series;

            chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRange => {
                if (!logicalRange) return;

                if (logicalRange?.from < 10) {
                    const additionalBars = 50;
                    loadHistoricalCandles(candleCache.current.size + additionalBars)
                }
            })

            const resizeObserver = new ResizeObserver(() => {
                if (!chartRef.current || !containerRef.current) return;
                chartRef.current.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            });

            resizeObserverRef.current = resizeObserver;
            resizeObserver.observe(containerRef.current);


            return () => {
                safeCleanup();
            };
        } catch (error) {
            console.error('Error in chart initialization:', error);
            safeCleanup();
        }

    }, [
        symbol,
        timeframe,
        normalizedTimeframe,
        safeCleanup,
        loadHistoricalCandles
    ]);

    useChartInteractions({
        chart: chartRef.current!,
        series: seriesRef.current!,
        containerRef: containerRef.current!,
    });

    useEffect(() => {
        if (!chartRef.current) return;
        try {
            chartRef.current.applyOptions({
                layout: state.chart.settings.background.theme === 'light' ? ThemeConfig.light : ThemeConfig.dark,
                crosshair: { mode: state.chart.cursor },
                grid: {
                    vertLines: state.chart.settings.background.grid.vertLines,
                    horzLines: state.chart.settings.background.grid.horzLines
                }
            });
        } catch (error) {
            console.error('Error applying chart options:', error);
        }
    }, [state.chart.cursor, state.chart.settings.background.grid, state.chart.settings.background.theme]);

    useEffect(() => {
        if (!seriesRef.current) return;
        try {
            seriesRef.current.applyOptions({
                upColor: state.chart.settings.candles.upColor,
                downColor: state.chart.settings.candles.downColor,
                borderVisible: state.chart.settings.candles.borderVisible,
                wickUpColor: state.chart.settings.candles.wickupColor,
                wickDownColor: state.chart.settings.candles.wickDownColor,
            });
        } catch (error) {
            console.error('Error applying series options:', error);
        }
    }, [state.chart.settings.candles]);

    return {
        chart: chartRef.current,
        series: seriesRef.current,
        isChartInitialized: chartInitialized
    };
}