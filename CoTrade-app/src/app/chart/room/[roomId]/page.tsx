'use client'

import ClientChart from "@/components/chart/ClientChart";
import { AppState, defaultAppState } from "@/components/chart/Context";
import { use, useEffect, useState } from "react";
import { getInitialState } from "../../page";
import { useSearchParams } from "next/navigation";

export default function ChartCollabRoom(
    { params }: {
        params: Promise<{ roomId: string }>
    }) {
    const { roomId } = use(params);
    const searchParams = useSearchParams();
    const isHost = searchParams.get("isHost") === 'true';

    const [initialState, setInitialState] = useState<AppState>(defaultAppState);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!roomId) {
            console.error("missing roomId")
            return;
        }

        if (isHost) {
            setInitialState(getInitialState());
        }
        setIsLoaded(true);
    }, [roomId, isHost])

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