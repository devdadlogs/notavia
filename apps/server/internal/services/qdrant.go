package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// QdrantService handles communication with the Qdrant vector database.
type QdrantService struct {
	baseURL    string
	collection string
}

func NewQdrantService() *QdrantService {
	return &QdrantService{
		baseURL:    "http://localhost:6333",
		collection: "notes",
	}
}

// InitCollection ensures the collection exists.
func (s *QdrantService) InitCollection() error {
	// Check if collection exists
	resp, err := http.Get(fmt.Sprintf("%s/collections/%s", s.baseURL, s.collection))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		return nil // Already exists
	}

	// Create collection (nomic-embed-text generates 768-dimensional vectors)
	reqBody := map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     768,
			"distance": "Cosine",
		},
	}
	body, _ := json.Marshal(reqBody)
	
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/collections/%s", s.baseURL, s.collection), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	
	createResp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer createResp.Body.Close()

	if createResp.StatusCode != 200 {
		b, _ := io.ReadAll(createResp.Body)
		return fmt.Errorf("failed to create qdrant collection: %s", string(b))
	}

	return nil
}

// UpsertNote chunks the note and stores embeddings in Qdrant.
// We use a simplified UUID generation for point IDs.
func (s *QdrantService) UpsertNote(noteID, title, content string, embedding []float32) error {
	// For simplicity in this demo, we store the whole note as 1 point.
	// In production, we'd chunk the content.
	
	reqBody := map[string]interface{}{
		"points": []map[string]interface{}{
			{
				"id":      noteID, // We use noteID string as UUID in Qdrant if it's a valid UUID, which our note ID is.
				"vector":  embedding,
				"payload": map[string]interface{}{
					"title":   title,
					"content": content,
				},
			},
		},
	}
	
	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/collections/%s/points", s.baseURL, s.collection), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to upsert point: %s", string(b))
	}
	return nil
}

// SearchRelatedNotes searches for similar notes.
type SearchResult struct {
	NoteID  string  `json:"noteId"`
	Title   string  `json:"title"`
	Content string  `json:"content"`
	Score   float32 `json:"score"`
}

func (s *QdrantService) SearchRelatedNotes(queryEmbedding []float32, limit int, excludeNoteID string) ([]SearchResult, error) {
	reqBody := map[string]interface{}{
		"vector": queryEmbedding,
		"limit":  limit,
		"with_payload": true,
	}

	// Exclude the current note from results
	if excludeNoteID != "" {
		reqBody["filter"] = map[string]interface{}{
			"must_not": []map[string]interface{}{
				{
					"has_id": []string{excludeNoteID},
				},
			},
		}
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/collections/%s/points/search", s.baseURL, s.collection), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to search points: %s", string(b))
	}

	var result struct {
		Result []struct {
			ID      string  `json:"id"`
			Score   float32 `json:"score"`
			Payload struct {
				Title   string `json:"title"`
				Content string `json:"content"`
			} `json:"payload"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var searchResults []SearchResult
	for _, item := range result.Result {
		searchResults = append(searchResults, SearchResult{
			NoteID:  item.ID,
			Title:   item.Payload.Title,
			Content: item.Payload.Content,
			Score:   item.Score,
		})
	}

	return searchResults, nil
}
