package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Room struct {
	ID         string
	Broadcast  chan []byte
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	// State      RoomState
}

type Client struct {
	Conn        *websocket.Conn
	DisplayName string
	Send        chan []byte
	Room        *Room
}

type Action struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

var rooms = make(map[string]*Room)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func (c *Client) startRead() {
	defer func() {
		c.Room.Unregister <- c
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		message = bytes.TrimSpace(message)
		c.Room.Broadcast <- message
	}
}

func (c *Client) startWrite() {
	defer func() {
		c.Conn.Close()
		c.Room.Unregister <- c
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}

			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		}
	}
}

func (r *Room) start() {
	for {
		select {
		case client := <-r.Register:
			r.Clients[client] = true
			client.Room = r
			activeUsers := len(r.Clients)

			go client.startRead()
			go client.startWrite()

			a := Action{
				Type: "USER_JOINED",
				Payload: map[string]any{
					"displayName":    client.DisplayName,
					"numActiveUsers": activeUsers,
				},
			}

			action, err := json.Marshal(a)

			if err != nil {
				fmt.Printf("There was an error marshaling the action: %v\n", err)
				continue
			}

			fmt.Printf("New user joined: %s (Room: %s, Active users: %d)\n", client.DisplayName, r.ID, activeUsers)

			r.broadcastToAll(action, client)

		case client := <-r.Unregister:
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)

				a := Action{
					Type: "USER_LEFT",
					Payload: map[string]any{
						"displayName": client.DisplayName,
					},
				}

				action, err := json.Marshal(a)

				if err != nil {
					return
				}

				r.broadcastToAll(action, client)
			}

		case message := <-r.Broadcast:
			r.broadcastToAll(message)
		}
	}
}

func (r *Room) broadcastToAll(message []byte, excluding ...*Client) {
	for client := range r.Clients {
		if len(excluding) > 0 && client == excluding[0] {
			continue
		}

		select {
		case client.Send <- message:
		default:
			log.Printf("Removing unresponsive client: %s\n", client.DisplayName)
			close(client.Send)
			delete(r.Clients, client)
			client.Conn.Close()
		}
	}
}

func (c *Client) handleSocketClose(code int, text string) {
	if c.Room != nil {
		c.Room.Unregister <- c
	}
}

func JoinRoom(w http.ResponseWriter, r *http.Request) {
	roomId := r.URL.Query().Get("roomId")
	displayName := r.URL.Query().Get("displayName")

	room, ok := rooms[roomId]
	if !ok {
		log.Printf("Room not found for ID: %q", roomId)
		http.Error(w, "error: could not find room", http.StatusNotFound)
		return
	}

	upgrader.CheckOrigin = func(r *http.Request) bool { return true }

	Conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("error upgrading: %v", err)
		return
	}

	client := &Client{
		Conn:        Conn,
		Send:        make(chan []byte, 256),
		DisplayName: displayName,
		Room:        room,
	}

	Conn.SetCloseHandler(
		func(code int, text string) error {
			client.handleSocketClose(code, text)
			return nil
		},
	)
	fmt.Printf("Connecting user to room: %s", roomId)
	room.Register <- client
}

func CreateRoom(w http.ResponseWriter, r *http.Request) {
	roomId := uuid.New().String()

	_, ok := rooms[roomId]
	if ok {
		return
	}

	room := &Room{
		ID:         roomId,
		Broadcast:  make(chan []byte),
		Clients:    make(map[*Client]bool),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		// State:      roomState,
	}

	rooms[room.ID] = room
	go room.start()

	response := map[string]string{
		"roomId": room.ID,
		"url":    fmt.Sprintf("/chart/room/%s", room.ID),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
