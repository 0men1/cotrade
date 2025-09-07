'use client'

import { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi, SeriesType, MouseEventParams, Coordinate } from 'lightweight-charts';
import { AppState, useApp } from '../context';
import { BaseDrawing } from '@/core/chart/drawings/primitives/BaseDrawing';
import { setCursor } from '@/core/chart/cursor';
import { SerializedDrawing } from '@/core/chart/drawings/types';
import { TrendLine } from '@/core/chart/drawings/primitives/TrendLine';
import { VertLine } from '@/core/chart/drawings/primitives/VertLine';

type useChartInteractionsParams = {
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    containerRef: HTMLDivElement,
}

export function restoreDrawing(drawing: SerializedDrawing): BaseDrawing | null {
    try {
        var restoredDrawing: BaseDrawing | null = null;
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
        console.error(`Failed to restore drawing ${drawing.id}`)
    }
    return null;
}

export function useChartInteractions({
    chart,
    series,
    containerRef,
}: useChartInteractionsParams) {
    const { state, action } = useApp();
    const stateRef = useRef<AppState>(state);
    const drawingRef = useRef<Map<string, BaseDrawing>>(new Map());

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        if (!series) return;

        const currentDrawings = drawingRef.current;
        const serializedDrawings = state.chart.drawings.collection;

        for (const drawing of currentDrawings.values()) {
            try {
                series.detachPrimitive(drawing);
            } catch (error) {
                console.error("failed to detach drawing: ", error);
                return;
            }
        }
        currentDrawings.clear();

        for (const drawing of serializedDrawings) {
            const restoredDrawing = restoreDrawing(drawing);
            if (restoredDrawing) {
                series.attachPrimitive(restoredDrawing)
                currentDrawings.set(drawing.id, restoredDrawing)
            }
        }

        // return () => {
        //     for (const drawing of currentDrawings.values()) {
        //         try {
        //             series.detachPrimitive(drawing);
        //         } catch (error) {
        //             console.error("failed to detach drawing: ", error)
        //         }
        //     }
        //     currentDrawings.clear();
        // }
    }, [state.chart.drawings.collection, series, chart])

    function hitTest(x: Coordinate, y: Coordinate): BaseDrawing | null {
        if (drawingRef.current)
            for (const drawing of drawingRef.current.values()) {
                if (drawing.isPointOnDrawing(x, y)) return drawing;
            }
        return null;
    }

    useEffect(() => {
        if (!chart || !series || !containerRef) return;

        const mouseClickHandler = (param: MouseEventParams) => {
            if (!param.point) return;
            const { tools, drawings } = stateRef.current.chart;
            if (tools.activeHandler && param.logical !== undefined) {
                const drawing = tools.activeHandler?.onClick(param.point.x, param.point.y, param.logical);
                if (drawing) {
                    action.addDrawing(drawing);
                }
            } else {
                const drawing = hitTest(param.point.x, param.point.y);
                if (drawing) {
                    if (drawings.selected && drawing.id !== drawings.selected?.id) {
                        drawingRef.current.get(drawings.selected.id)?.setSelected(false);
                    }
                    drawing.setSelected(true);
                    action.selectDrawing(drawing);
                } else if (drawings.selected) {
                    drawingRef.current.get(drawings.selected.id)?.setSelected(false);
                    action.selectDrawing(null);
                }
            }
        };

        const mouseMoveHandler = (param: MouseEventParams) => {
            if (!param.point) return;
            const hoveredDrawing = hitTest(param.point.x, param.point.y);
            setCursor(hoveredDrawing ? 'pointer' : 'default')
        };

        chart.subscribeClick(mouseClickHandler);
        chart.subscribeCrosshairMove(mouseMoveHandler);

        return () => {
            chart.unsubscribeClick(mouseClickHandler);
            chart.unsubscribeCrosshairMove(mouseMoveHandler);
        };
    }, [chart, series, containerRef]);
}