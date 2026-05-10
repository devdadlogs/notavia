package services

import (
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// YjsHub manages WebSocket connections for Yjs document synchronization.
// It acts as a simple broadcast relay: any message from one client
// is forwarded to all other clients on the same document.
type YjsHub struct {
	mu    sync.RWMutex
	rooms map[string]map[*websocket.Conn]bool // docID -> set of connections
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in dev; restrict in production
	},
}

func NewYjsHub() *YjsHub {
	return &YjsHub{
		rooms: make(map[string]map[*websocket.Conn]bool),
	}
}

// HandleConnection upgrades an HTTP request to WebSocket and joins the document room.
func (h *YjsHub) HandleConnection(w http.ResponseWriter, r *http.Request, docID string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Join room
	h.mu.Lock()
	if h.rooms[docID] == nil {
		h.rooms[docID] = make(map[*websocket.Conn]bool)
	}
	h.rooms[docID][conn] = true
	clientCount := len(h.rooms[docID])
	h.mu.Unlock()

	fmt.Printf("🔗 Yjs client connected to doc '%s' (%d clients)\n", docID, clientCount)

	// Cleanup on disconnect
	defer func() {
		h.mu.Lock()
		delete(h.rooms[docID], conn)
		if len(h.rooms[docID]) == 0 {
			delete(h.rooms, docID)
		}
		remaining := len(h.rooms[docID])
		h.mu.Unlock()
		conn.Close()
		fmt.Printf("🔌 Yjs client disconnected from doc '%s' (%d remaining)\n", docID, remaining)
	}()

	// Read messages and broadcast to other clients in the same room
	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			break // Client disconnected
		}

		h.broadcast(docID, conn, messageType, message)
	}
}

// broadcast sends a message to all clients in a room except the sender.
func (h *YjsHub) broadcast(docID string, sender *websocket.Conn, messageType int, message []byte) {
	h.mu.RLock()
	clients := h.rooms[docID]
	h.mu.RUnlock()

	for client := range clients {
		if client != sender {
			if err := client.WriteMessage(messageType, message); err != nil {
				log.Printf("Broadcast write error: %v", err)
			}
		}
	}
}

// GetStats returns connection statistics.
func (h *YjsHub) GetStats() map[string]int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	stats := make(map[string]int)
	for docID, clients := range h.rooms {
		stats[docID] = len(clients)
	}
	return stats
}
