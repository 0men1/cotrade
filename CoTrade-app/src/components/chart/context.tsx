'use client'
import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { BaseDrawing } from "@/core/chart/drawings/primitives/BaseDrawing";
import { DrawingTool, BaseDrawingHandler, SerializedDrawing } from "@/core/chart/drawings/types";
import { IntervalKey } from "@/core/chart/market-data/types";
import { CrosshairMode } from "lightweight-charts";
import { Action, reducer } from "./reducer";
import { LocalStorage } from "@/lib/localStorage";

export interface ChartSettings {
    isOpen: boolean
    background: {
        theme: "dark" | "light";
        grid: {
            vertLines: {
                visible: boolean;
            };
            horzLines: {
                visible: boolean;
            };
        };
    };
    candles: {
        upColor: string;
        downColor: string;
        borderVisible: boolean;
        wickupColor: string;
        wickDownColor: string;
    };

}

export interface AppState {
    collaboration: {
        isOpen: boolean;
        displayName: string,
        room: {
            id: string | null,
            isHost: boolean,
            isLoading: boolean,
            activeUsers: string[]
        }
    };
    chart: {
        id: string;
        tools: {
            activeTool: DrawingTool | null,
            activeHandler: BaseDrawingHandler | null,
        }
        drawings: {
            collection: SerializedDrawing[];
            selected: BaseDrawing | null;
        };
        settings: ChartSettings;
        cursor: CrosshairMode;
        data: {
            style: string;
            symbol: string;
            timeframe: IntervalKey;
            exchange: string;
        };
    }
}

export const defaultAppState: AppState = {
    collaboration: {
        isOpen: false,
        displayName: "solo_user",
        room: {
            id: null,
            isLoading: false,
            isHost: false,
            activeUsers: [],
        }
    },
    chart: {
        id: "SOL-USD:coinbase",
        drawings: {
            collection: [],
            selected: null
        },
        tools: {
            activeTool: null,
            activeHandler: null
        },
        settings: {
            isOpen: false,
            background: {
                theme: "dark",
                grid: {
                    vertLines: {
                        visible: true
                    },
                    horzLines: {
                        visible: true
                    }
                },
            },
            candles: {
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickupColor: '#26a69a',
                wickDownColor: '#ef5350'
            },
        },
        data: {
            style: 'candle',
            symbol: "SOL-USD",
            timeframe: "1m",
            exchange: "coinbase"
        },
        cursor: CrosshairMode.Normal,
    }
};

interface AppContextType {
    state: AppState;
    action: {
        userJoined: (displayName: string) => void;
        userLeft: (displayName: string) => void;
        sendFullState: () => void;
        deleteDrawing: (drawing: BaseDrawing) => void;
        startTool: (tool: DrawingTool, handler: BaseDrawingHandler) => void;
        cancelTool: () => void;
        selectChart: (symbol: string, timeframe: IntervalKey, exchange: string) => void;
        selectDrawing: (drawing: BaseDrawing | null) => void;
        toggleSettings: (state: boolean) => void;
        toggleCollabWindow: (state: boolean) => void;
        joinCollabRoom: (room: { roomId: string, displayName: string }) => void;
        exitCollabRoom: () => void;
        updateSettings: (settings: ChartSettings) => void;
        cleanupState: () => void;
        handleIncomingAction: (incomingAction: Action) => void;
    };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{
    children: React.ReactNode;
    roomId?: string;
    initialState?: Partial<AppState>;
}> = ({ children, initialState, roomId }) => {
    const [state, dispatch] = useReducer(reducer, {
        ...defaultAppState,
        ...initialState,
        collaboration: {
            ...defaultAppState.collaboration,
            ...initialState?.collaboration,
            room: {
                ...defaultAppState.collaboration.room,
                ...initialState?.collaboration?.room,
                isLoading: !!roomId
            }
        }
    });
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (state.chart.tools.activeTool || state.chart.tools.activeHandler || state.chart.drawings.selected) {
            return;
        }
        LocalStorage.setItem("AppState", state);
    }, [state])

    useEffect(() => {
        if (roomId && !wsRef.current) {
            const roomUrl = `localhost:8080/rooms/join?roomId=${roomId}&displayName=${state.collaboration.displayName}`

            wsRef.current = new WebSocket(`ws://${roomUrl}`);

            wsRef.current.onopen = () => {
                console.log("Socket connection open")
                action.joinCollabRoom({ roomId, displayName: state.collaboration.displayName })
            }

            wsRef.current.onmessage = (event: MessageEvent) => {
                const incomingAction = JSON.parse(event.data)
                console.log(`Received action: `, incomingAction.type)
                action.handleIncomingAction(incomingAction);
            }

            wsRef.current.onclose = () => {
                console.log("Socket connection closed")
                action.exitCollabRoom()
                dispatch({ type: "END_LOADING", payload: {} })
            }

            wsRef.current.onerror = (error: Event) => {
                console.log("socket connection error: ", error)
                dispatch({ type: "END_LOADING", payload: {} })
            }
        }

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        }
    }, [roomId])

    const action = useMemo(() => ({

        // ----------------DRAWING FUNCTIONS-------------------
        addDrawing: (drawing: BaseDrawing) => {
            const act: Action = {
                type: "ADD_DRAWING",
                payload: {
                    drawing: drawing.serialize()
                }
            }
            dispatch(act);
            wsRef.current?.send(JSON.stringify(act));
        },

        deleteDrawing: (drawing: BaseDrawing) => {
            const act: Action = {
                type: "DELETE_DRAWING",
                payload: {
                    drawing:
                        drawing.serialize()
                }
            }
            dispatch(act);
            wsRef.current?.send(JSON.stringify(act));
        },

        selectDrawing: (drawing: BaseDrawing | null) => {
            dispatch({ type: "SELECT_DRAWING", payload: { drawing } })
        },

        startTool: (tool: DrawingTool, handler: BaseDrawingHandler) => {
            dispatch({ type: "START_TOOL", payload: { tool, handler } })
        },

        cancelTool: () => {
            dispatch({ type: "CANCEL_TOOL", payload: {} })
        },



        // ----------------COLLAB FUNCTIONS-------------------
        userJoined: (displayName: string) => {
            console.log("User joined")
            const act: Action = {
                type: "USER_JOINED",
                payload: {
                    displayName
                }
            }
            action.handleIncomingAction(act);
        },

        userLeft: (displayName: string) => {
            const act: Action = {
                type: "USER_LEFT",
                payload: {
                    displayName
                }
            }
            action.handleIncomingAction(act);
        },

        toggleCollabWindow: (state: boolean) => {
            dispatch({ type: "TOGGLE_COLLAB_WINDOW", payload: { state } })
        },

        joinCollabRoom: (room: { roomId: string, displayName: string }) => {
            dispatch({ type: "JOIN_COLLAB_ROOM", payload: { room } })
        },

        exitCollabRoom: () => {
            dispatch({ type: "LEAVE_COLLAB_ROOM", payload: {} })
            wsRef.current?.close()
        },

        sendFullState: () => {
            const act: Action = {
                type: "SYNC_FULL_STATE",
                payload: {
                    state
                }
            }
            wsRef.current?.send(JSON.stringify(act))
        },

        handleIncomingAction: (incomingAction: Action) => {
            if (incomingAction.type === "USER_JOINED") {
                dispatch(incomingAction);
                action.sendFullState();
            } else if (incomingAction.type === "SYNC_FULL_STATE") {
                dispatch(incomingAction);
            } else if (incomingAction.type === "USER_LEFT") {
                dispatch(incomingAction);
            } else {
                dispatch(incomingAction);
            }
        },



        // ----------------CHART FUNCTIONS-------------------
        selectChart: (symbol: string, timeframe: IntervalKey, exchange: string) => {
            const act: Action = {
                type: "SELECT_CHART",
                payload: {
                    symbol,
                    timeframe,
                    exchange
                }
            }
            dispatch(act)
            wsRef.current?.send(JSON.stringify(act))
        },

        toggleSettings: (state: boolean) => {
            dispatch({ type: "TOGGLE_SETTINGS", payload: { state } })
        },

        updateSettings: (settings: ChartSettings) => {
            dispatch({ type: "UPDATE_SETTINGS", payload: { settings } })
        },

        cleanupState: () => {
            dispatch({ type: "CLEANUP_STATE", payload: {} })
        },


    }), [])

    return (
        <AppContext.Provider value={{ state, action }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);

    if (!context) {
        throw new Error("useApp must be used within AppProvider");
    }
    return context;
}