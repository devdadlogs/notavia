package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/google/uuid"
	"github.com/notavia/server/internal/config"
)

// QdrantService handles communication with the Qdrant vector database.
type QdrantService struct {
	baseURL    string
	collection string
}

func NewQdrantService() *QdrantService {
	return &QdrantService{
		baseURL:    config.AppConfig.QdrantURL,
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

// UpsertNoteChunks stores multiple chunks for a single note in Qdrant.
func (s *QdrantService) UpsertNoteChunks(userID, noteID, title string, chunks []string, embeddings [][]float32) error {
	var points []map[string]interface{}
	for i, chunk := range chunks {
		points = append(points, map[string]interface{}{
			"id":     uuid.New().String(),
			"vector": embeddings[i],
			"payload": map[string]interface{}{
				"userId":  userID,
				"noteId":  noteID, // we need this to delete old chunks
				"title":   title,
				"content": chunk,
			},
		})
	}

	reqBody := map[string]interface{}{
		"points": points,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/collections/%s/points?wait=true", s.baseURL, s.collection), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to upsert points: %s", string(b))
	}
	return nil
}

// DeleteNotesByNoteID deletes all points associated with a given noteID.
func (s *QdrantService) DeleteNotesByNoteID(noteID string) error {
	reqBody := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{
					"key": "noteId",
					"match": map[string]interface{}{
						"value": noteID,
					},
				},
			},
		},
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/collections/%s/points/delete?wait=true", s.baseURL, s.collection), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to delete points: %s", string(b))
	}
	return nil
}

// DeleteAllNotesByUserID deletes all points associated with a given userID.
func (s *QdrantService) DeleteAllNotesByUserID(userID string) error {
	reqBody := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{
					"key": "userId",
					"match": map[string]interface{}{
						"value": userID,
					},
				},
			},
		},
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/collections/%s/points/delete?wait=true", s.baseURL, s.collection), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to delete all points for user: %s", string(b))
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

func (s *QdrantService) SearchRelatedNotes(userID string, queryEmbedding []float32, limit int, excludeNoteID string) ([]SearchResult, error) {
	reqBody := map[string]interface{}{
		"vector":       queryEmbedding,
		"limit":        limit,
		"with_payload": true,
	}

	// Filter by userID and optionally exclude noteID
	mustConditions := []map[string]interface{}{
		{
			"key": "userId",
			"match": map[string]interface{}{
				"value": userID,
			},
		},
	}

	filter := map[string]interface{}{
		"must": mustConditions,
	}

	// Exclude the current note from results
	if excludeNoteID != "" {
		filter["must_not"] = []map[string]interface{}{
			{
				"key": "noteId",
				"match": map[string]interface{}{
					"value": excludeNoteID,
				},
			},
		}
	}

	reqBody["filter"] = filter

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
				NoteID  string `json:"noteId"`
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
			NoteID:  item.Payload.NoteID,
			Title:   item.Payload.Title,
			Content: item.Payload.Content,
			Score:   item.Score,
		})
	}

	return searchResults, nil
}
