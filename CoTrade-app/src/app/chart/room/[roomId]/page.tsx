'use client'

import ClientChart from "@/components/chart/ClientChart";
import { AppState, defaultAppState } from "@/components/chart/Context";
import { use, useEffect, useState } from "react";
import { getInitialState } from "../../page";

export default function ChartCollabRoom(
    { params }: {
        params: Promise<{ roomId: string }>
    }) {
    const { roomId } = use(params);
    const [initialState, setInitialState] = useState<AppState>(defaultAppState);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!roomId) {
            console.error("missing roomId")
            return;
        }

        setInitialState(getInitialState());
        setIsLoaded(true);
    }, [roomId])

    if (!roomId) {
        return <div>Error: Missing room ID</div>;
    }

    if (!isLoaded) {
        return <div>Loading...</div>
    }

    return (
        <ClientChart roomId={roomId} initialState={initialState} />
    )
}