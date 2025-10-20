package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"
)

type Candlestick struct {
	High      float64
	Low       float64
	Open      float64
	Close     float64
	Volume    float64
	Timestamp int64
}

type CandleResponse struct {
	Data  [][]float64
	Index int
	Error error
}

type CandleRequest struct {
	Symbol      string
	Start       int64
	End         int64
	Granularity int
	Index       int
}

// Bank: Symbol: granularity: Candles[]
var CandleBank = make(map[string]map[int64][]Candlestick)

func GetCandles(w http.ResponseWriter, r *http.Request) {
	symbol := r.URL.Query().Get("symbol")
	timeframe := r.URL.Query().Get("timeframe")

	if symbol == "" || timeframe == "" {
		http.Error(w, "Must include symbol/timeframe in request", http.StatusBadRequest)
		return
	}

	granularity, err := getInterval(timeframe)
	if err != nil {
		http.Error(w, fmt.Sprintf("Internal Error: %v", err), http.StatusBadRequest)
		return
	}

	var start, end int64

	if startParam := r.URL.Query().Get("start"); startParam != "" {
		if start, err = strconv.ParseInt(startParam, 10, 64); err != nil {
			http.Error(w, "Invalid Interval", http.StatusBadRequest)
			return
		}
	}

	if endParam := r.URL.Query().Get("end"); endParam != "" {
		if end, err = strconv.ParseInt(endParam, 10, 64); err != nil {
			http.Error(w, "Invalid interval", http.StatusBadRequest)
			return
		}
	}

	totalTimeRange := end - start
	candlesNeeded := totalTimeRange / granularity

	var allCandles [][]float64
	var candles []Candlestick

	if candlesNeeded > 300 {
		totalCalls := int(math.Ceil(float64(candlesNeeded) / 300))
		responseChan := make(chan CandleResponse, totalCalls)

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)

		defer cancel()

		for i := range totalCalls {
			currentStart := start + int64(i*int(granularity)*300)
			currentEnd := min(currentStart+(granularity*300), end)

			go func(index int, start, end int64) {
				fetchedCandles, err := fetchCandlesFromCoinbase(ctx, CandleRequest{
					Symbol:      symbol,
					Start:       start,
					End:         end,
					Granularity: int(granularity),
					Index:       index,
				})
				if err != nil {
					log.Printf("Error fetching candles: %v", err)
					http.Error(w, fmt.Sprintf("Failed to fetch candles: %v", err), http.StatusInternalServerError)
					return
				}

				responseChan <- CandleResponse{Data: fetchedCandles, Index: index}
			}(i, currentStart, currentEnd)
		}

		responses := make([]CandleResponse, totalCalls)
		for range totalCalls {
			select {
			case res := <-responseChan:
				if res.Error != nil {
					http.Error(w, fmt.Sprintf("Error fetching batch %d: %v", res.Index, res.Error), http.StatusInternalServerError)
					return
				}
				responses[res.Index] = res
			case <-ctx.Done():
				http.Error(w, "Timed out fetching candle data", http.StatusGatewayTimeout)
				return
			}
		}

		for _, response := range responses {
			allCandles = append(allCandles, response.Data...)
		}

	} else {
		fetchedCandles, err := fetchCandlesFromCoinbase(r.Context(), CandleRequest{
			Symbol:      symbol,
			Start:       start,
			End:         end,
			Granularity: int(granularity),
			Index:       0,
		})
		if err != nil {
			log.Printf("Error fetching candles: %v", err)
			http.Error(w, fmt.Sprintf("Failed to fetch candles: %v", err), http.StatusInternalServerError)
			return
		}
		allCandles = fetchedCandles
	}

	for _, c := range allCandles {
		if len(c) >= 6 {
			candles = append(candles, Candlestick{
				Timestamp: int64(c[0]),
				Low:       c[1],
				High:      c[2],
				Open:      c[3],
				Close:     c[4],
				Volume:    c[5],
			})
		}
	}

	if len(candles) > 0 {
		log.Printf("Found %d candles", len(candles))
	}

	sort.Slice(candles, func(i, j int) bool {
		return candles[i].Timestamp < candles[j].Timestamp
	})

	result := make([][]float64, len(candles))
	for i, candle := range candles {
		result[i] = []float64{
			float64(candle.Timestamp),
			candle.Low,
			candle.High,
			candle.Open,
			candle.Close,
			candle.Volume,
		}
	}

	log.Printf("Returning %d candles for %s at %s", len(result), symbol, timeframe)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(result)
}

func fetchCandlesFromCoinbase(ctx context.Context, request CandleRequest) ([][]float64, error) {
	url := fmt.Sprintf("https://api.exchange.coinbase.com/products/%s/candles?granularity=%d&start=%d&end=%d", request.Symbol, request.Granularity, request.Start, request.End)

	fmt.Printf("Sending request: %s\n", url)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)

	if err != nil {
		return nil, fmt.Errorf("error creating request")
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request")
	}

	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response")
	}

	var candles [][]float64

	if err := json.Unmarshal(body, &candles); err != nil {
		return nil, fmt.Errorf("error parsing response: %v, body: %s", err, string(body))
	}

	sort.Slice(candles, func(i, j int) bool {
		return candles[i][0] < candles[j][0]
	})

	return candles, nil
}

func getInterval(timeframe string) (int64, error) {
	switch timeframe {
	case "1m":
		return 60, nil
	case "5m":
		return 300, nil
	case "15m":
		return 900, nil
	default:
		return -1, fmt.Errorf("unsupported interval")
	}
}
