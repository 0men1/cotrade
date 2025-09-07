import { ExchangeAdapter } from "./ExchangeAdapter";
import { CoinbaseExchange } from "./exchanges/CoinbaseExchange";
import { ExchangeType, TickData, ConnectionState } from "@/core/chart/market-data/types";


export class ExchangeManager {
    private exchanges = new Map<ExchangeType, ExchangeAdapter>();
    private symbolSubscriptions = new Map<string, {
        exchange: ExchangeType;
        unsubscribe: () => void;
    }>();

    constructor() {
        this.exchanges.set('coinbase', new CoinbaseExchange());
    }

    subscribe(
        symbol: string,
        exchange: ExchangeType,
        onTick: (data: TickData) => void
    ): () => void {
        const exchangeAdapter = this.exchanges.get(exchange);

        if (!exchangeAdapter) {
            throw new Error(`Exhcnage ${exchange} not supported`);
        }

        exchangeAdapter.connect();

        const unsubscribe = exchangeAdapter.subscribe(symbol, onTick);
        const subscriptionKey = `${exchange}:${symbol}`

        this.symbolSubscriptions.set(subscriptionKey, {
            exchange,
            unsubscribe
        });

        return () => {
            unsubscribe();
            this.symbolSubscriptions.delete(subscriptionKey);
        }
    }

    getConnectionStatus(exchange: ExchangeType): (callback: (state: ConnectionState) => void) => () => void {
        const exchangeAdapter = this.exchanges.get(exchange);
        if (!exchangeAdapter) {
            throw new Error(`Exchange ${exchange} not supported`);
        }

        return exchangeAdapter.onStatusChange.bind(exchangeAdapter);
    }

    getAllStatuses(): Map<ExchangeType, (callback: (state: ConnectionState) => void) => () => void> {
        const statuses = new Map();
        for (const [type, adapter] of this.exchanges) {
            statuses.set(type, adapter.onStatusChange.bind(adapter));
        }
        return statuses;
    }

    destroy(): void {
        this.exchanges.forEach(exchange => exchange.destroy());
        this.symbolSubscriptions.clear();
    }
}

let exchangeManager: ExchangeManager | null = null;

export function getExchangeManager(): ExchangeManager {
    if (!exchangeManager) {
        exchangeManager = new ExchangeManager();
    }
    return exchangeManager
}