'use client'

import { useEffect } from "react";
import { MoveDiagonal, MoveUp } from "lucide-react";
import { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { DrawingHandlerFactory } from "@/core/chart/drawings/DrawingHandlerFactory";
import { Button } from "../ui/button";
import { DrawingTool } from "@/core/chart/drawings/types";
import { useApp } from "./Context";

interface ToolboxProps {
    chart: IChartApi | null;
    series: ISeriesApi<SeriesType> | null;
}

const Toolbox: React.FC<ToolboxProps> = ({ chart, series }) => {
    const { state, action } = useApp();
    const { activeTool } = state.chart.tools

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (activeTool) {
                    action.cancelTool()
                }
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => {
            window.removeEventListener("keydown", handleEscape);
        }
    }, [activeTool, action]);

    function setTool(tool: DrawingTool) {
        if (!chart || !series) return;

        if (tool === activeTool) {
            action.cancelTool()
            return;
        }

        const handlerFactory = new DrawingHandlerFactory(chart, series);

        try {
            const handler = handlerFactory.createHandler(tool);

            if (handler) {
                action.startTool(tool, handler)
            }
        } catch (error) {
            console.error("failed to set tool: ", error);
            action.cancelTool()
        }
    }

    const buttons = [
        { tool: "verticalLine" as DrawingTool, icon: <MoveUp size={16} />, label: "Vertical" },
        { tool: "trendline" as DrawingTool, icon: <MoveDiagonal size={16} />, label: "Trendline" },
    ];

    return (
        <div className="flex flex-col h-full w-12 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
            {buttons.map(({ tool, icon, label }) => (
                <Button
                    key={tool}
                    variant={activeTool === tool ? "default" : "ghost"}
                    size="icon"
                    className="m-1"
                    onClick={() => setTool(tool)}
                    title={label}
                >
                    {icon}
                </Button>
            ))}
        </div>
    );
};

export default Toolbox;