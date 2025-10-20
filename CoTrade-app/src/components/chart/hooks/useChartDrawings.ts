import { BaseDrawing } from "@/core/chart/drawings/primitives/BaseDrawing";
import { TrendLine } from "@/core/chart/drawings/primitives/TrendLine";
import { VertLine } from "@/core/chart/drawings/primitives/VertLine";
import { SerializedDrawing } from "@/core/chart/drawings/types";
import { useApp } from "../Context";
import { useCallback, useEffect, useRef } from "react";
import { getDrawings, setDrawings } from "@/lib/indexdb";
import { MouseEventParams } from "lightweight-charts";
import { setCursor } from "@/core/chart/cursor";


/**
 * This hook will be solely responsible for drawing and removing and storing drawings
 */
export function restoreDrawing(drawing: SerializedDrawing): BaseDrawing | null {
    try {
        let restoredDrawing: BaseDrawing | null = null;
        switch (drawing.type) {
            case "TrendLine":
                restoredDrawing = new TrendLine(drawing.points, drawing.options, drawing.id);
                break;

            case "VertLine":
                restoredDrawing = new VertLine(drawing.points, drawing.options, drawing.id)
                break;
        }
        if (restoredDrawing) {
            return restoredDrawing;
        }
    } catch (error) {
        console.error(`failed to restore drawing ${drawing.id}: `, error)
    }
    return null;
}

export function useChartDrawings() {
    const { state, action } = useApp();
    const { chartApi, seriesApi } = state.chart;
    const drawingsRef = useRef<Map<string, BaseDrawing>>(new Map());
    const isInitializedRef = useRef<string>(null);

    useEffect(() => {
        if (isInitializedRef.current && state.chart.id === isInitializedRef.current) {
            return;
        }

        const initializeDrawings = async () => {
            const recoveredDrawings = await getDrawings(state.chart.id);
            action.initializeDrawings(recoveredDrawings);
            isInitializedRef.current = state.chart.id;
        }

        initializeDrawings();
    }, [state.chart.id, seriesApi, action])

    useEffect(() => {
        if (!seriesApi || !isInitializedRef.current || isInitializedRef.current !== state.chart.id) {
            return
        }

        console.log('=== DRAWING SYNC EFFECT ===');
        console.log('Chart ID:', state.chart.id);
        console.log('Drawings in state:', state.chart.drawings.collection.length);
        console.log('Drawings:', state.chart.drawings.collection);

        const currentDrawings = drawingsRef.current;
        const serializedDrawings = state.chart.drawings.collection;

        for (const drawing of currentDrawings.values()) {
            try {
                seriesApi.detachPrimitive(drawing);
            } catch (error) {
                console.error("failed to detach drawing: ", error);
            }
        }

        currentDrawings.clear();

        for (const drawing of serializedDrawings) {
            const restoredDrawing = restoreDrawing(drawing);
            if (restoredDrawing) {
                console.log('Attaching drawing:', drawing.id);
                seriesApi.attachPrimitive(restoredDrawing);
                currentDrawings.set(drawing.id, restoredDrawing);
            } else {
                console.error('Failed to restore drawing:', drawing);
            }
        }

        return () => {
            currentDrawings.clear();
        }
    }, [state.chart.drawings.collection, seriesApi, state.chart.id])

    useEffect(() => {
        if (!isInitializedRef.current || isInitializedRef.current !== state.chart.id) return;
        setDrawings(state.chart.id, state.chart.drawings.collection);
    }, [state.chart.drawings.collection, state.chart.id])

    const mosueClickHandler = useCallback((param: MouseEventParams) => {
        if (!param.point || !param.logical) return;

        const { tools, drawings } = state.chart;
        if (tools.activeHandler) {
            const drawing = tools.activeHandler.onClick(param.point.x, param.point.y);
            if (drawing) {
                action.addDrawing(drawing);
            }
        } else {
            const hoveredDrawingId = param.hoveredObjectId as string;
            const drawing = drawingsRef.current.get(hoveredDrawingId);
            if (drawing) {
                if (drawings.selected && drawing.id !== drawings.selected.id) {
                    drawingsRef.current.get(drawings.selected.id)?.setSelected(false);
                }
                drawing.setSelected(true);
                action.selectDrawing(drawing);
            } else if (drawings.selected) {
                drawingsRef.current.get(drawings.selected.id)?.setSelected(false);
                action.selectDrawing(null);
            }
        }
    }, [state.chart.tools.activeHandler, state.chart.drawings, action])


    const mouseMoveHandler = useCallback((param: MouseEventParams) => {
        if (!param.point || !param.logical) return;

        const hoveredDrawingId = param.hoveredObjectId as string;
        const drawing = drawingsRef.current.get(hoveredDrawingId);
        setCursor(drawing ? 'pointer' : 'default')
    }, [])

    useEffect(() => {
        chartApi?.subscribeClick(mosueClickHandler);
        chartApi?.subscribeCrosshairMove(mouseMoveHandler);

        return () => {
            chartApi?.unsubscribeClick(mosueClickHandler);
            chartApi?.unsubscribeCrosshairMove(mouseMoveHandler);

        }
    }, [chartApi, mosueClickHandler, mouseMoveHandler])
}
