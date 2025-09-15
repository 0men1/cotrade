import { ChevronDown, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IntervalKey } from "@/core/chart/market-data/types";
import { useApp } from "./Context";

export default function ChartHeader() {
    const { state, action } = useApp();

    const tickers: string[] = ["SOL-USD", "BTC-USD", "ETH-USD"];
    const timeframes: string[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

    const handleChartUpdate = (symbol: string, timeframe: IntervalKey, exchange: string) => {
        action.selectChart(symbol, timeframe, exchange);
    };

    return (
        <div className="flex justify-between items-center w-full h-12 px-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            {/* Left side components */}
            <div className="flex items-center space-x-2">
                {/* Ticker selector */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="font-medium min-w-24">
                            {state.chart.data.symbol} <ChevronDown size={16} className="ml-1" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        {tickers.map((symbol) => (
                            <DropdownMenuItem
                                key={symbol}
                                onClick={() => handleChartUpdate(symbol, state.chart.data.timeframe, state.chart.data.exchange)}
                                className="cursor-pointer"
                            >
                                {symbol}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* Timeframe selector */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="font-medium min-w-16">
                            {state.chart.data.timeframe} <ChevronDown size={16} className="ml-1" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-24">
                        {timeframes.map((time) => (
                            <DropdownMenuItem
                                key={time}
                                onClick={() => handleChartUpdate(state.chart.data.symbol, time as IntervalKey, state.chart.data.exchange)}
                                className="cursor-pointer"
                            >
                                {time}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="flex items-center gap-7">
                <Button
                    onClick={() => { action.toggleCollabWindow(true) }}
                >
                    Share
                </Button>
                <Button
                    variant="outline"
                    size="lg"
                    className="rounded-md"
                    onClick={() => action.toggleSettings(true)}
                >
                    <Settings size={18} />
                </Button>
            </div>
        </div>
    );
};