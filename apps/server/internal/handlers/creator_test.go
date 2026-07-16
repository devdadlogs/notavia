package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/models"
	"github.com/notavia/server/internal/services"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreatorDomainValues(t *testing.T) {
	for _, status := range []string{"idea", "preparing", "writing", "ready", "published", "archived"} {
		if !validTopicStatus(status) {
			t.Fatalf("expected valid topic status %q", status)
		}
	}
	if validTopicStatus("unknown") {
		t.Fatal("unknown topic status must be rejected")
	}
	for _, platform := range []string{"zhihu", "xiaohongshu", "short_video"} {
		if !validPlatform(platform) {
			t.Fatalf("expected valid platform %q", platform)
		}
	}
	if validPlatform("twitter") {
		t.Fatal("unsupported platform must be rejected")
	}
}

func TestMaterialStatusValues(t *testing.T) {
	for _, status := range []string{"inbox", "distilled", "used", "later"} {
		if !validMaterialStatus(status) {
			t.Fatalf("expected valid material status %q", status)
		}
	}
	if validMaterialStatus("published") {
		t.Fatal("unsupported material status must be rejected")
	}
}

func setupCreatorTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.Topic{}, &models.TopicMaterial{}, &models.Note{}, &models.Work{}, &models.Citation{}, &models.Publication{}, &models.Revision{}, &models.StyleProfile{}, &models.MaterialInsight{}); err != nil {
		t.Fatal(err)
	}
	config.DB = db
}

type blockingInsightProvider struct {
	started chan struct{}
	release chan struct{}
}

func (p *blockingInsightProvider) CheckHealth() (bool, error)      { return true, nil }
func (p *blockingInsightProvider) ListModels() ([]string, error)   { return nil, nil }
func (p *blockingInsightProvider) Generate(string) (string, error) { return "", nil }
func (p *blockingInsightProvider) GenerateJSON(string) (string, error) {
	close(p.started)
	<-p.release
	return `{"items":[{"type":"summary","content":"测试摘要"}]}`, nil
}
func (p *blockingInsightProvider) GenerateStream(string, chan<- string, chan<- error) {}
func (p *blockingInsightProvider) Embed(string) ([]float32, error)                    { return nil, nil }
func (p *blockingInsightProvider) TranscribeAudio(string) (string, error)             { return "", nil }

var _ services.LLMProvider = (*blockingInsightProvider)(nil)

func TestExtractMaterialInsightsReturnsBeforeModelFinishes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	note := models.Note{ID: "async-note", UserID: "async-user", Title: "测试素材", ContentText: "足够用于提炼的测试内容"}
	config.DB.Create(&note)
	provider := &blockingInsightProvider{started: make(chan struct{}), release: make(chan struct{})}
	originalProvider := creatorInsightProvider
	creatorInsightProvider = func(string) services.LLMProvider { return provider }
	t.Cleanup(func() { creatorInsightProvider = originalProvider })

	startedAt := time.Now()
	w := creatorRequest(http.MethodPost, "/creator-ai/insights", note.UserID, map[string]string{"noteId": note.ID}, ExtractMaterialInsights)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d %s", w.Code, w.Body.String())
	}
	if elapsed := time.Since(startedAt); elapsed > 50*time.Millisecond {
		t.Fatalf("handler waited for model: %s", elapsed)
	}
	select {
	case <-provider.started:
	case <-time.After(time.Second):
		t.Fatal("background model call did not start")
	}
	close(provider.release)
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if current, ok := materialInsightJobs.Load(note.UserID + ":" + note.ID); ok && current.(materialInsightJob).Status == "ready" {
			materialInsightJobs.Delete(note.UserID + ":" + note.ID)
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("background insight job did not finish")
}

func creatorRequest(method, path, userID string, body any, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Params = gin.Params{{Key: "id", Value: path[strings.LastIndex(path, "/")+1:]}}
	c.Set("userID", userID)
	handler(c)
	return w
}

func TestTopicAPIKeepsUsersIsolated(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	w := creatorRequest(http.MethodPost, "/topics", "user-a", map[string]any{"title": "我的选题"}, CreateTopic)
	if w.Code != http.StatusCreated {
		t.Fatalf("create topic: %d %s", w.Code, w.Body.String())
	}
	var created models.Topic
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	w = creatorRequest(http.MethodGet, "/topics/"+created.ID, "user-b", nil, GetTopic)
	if w.Code != http.StatusNotFound {
		t.Fatalf("other user should not read topic, got %d", w.Code)
	}
	w = creatorRequest(http.MethodGet, "/topics/"+created.ID, "user-a", nil, GetTopic)
	if w.Code != http.StatusOK {
		t.Fatalf("owner should read topic, got %d", w.Code)
	}
}

func TestCitationMarkersOnlyReferenceSelectedMaterials(t *testing.T) {
	selected := map[string]models.Note{"note-a": {ID: "note-a", Title: "真实标题", ContentText: "真实原文内容"}}
	items := []citationPayload{{NoteID: "note-a"}, {NoteID: "note-b"}, {NoteID: ""}}
	filtered := filterCitations(items, selected)
	if len(filtered) != 2 {
		t.Fatalf("expected selected citation and model supplement, got %d", len(filtered))
	}
	if filtered[1].SourceAvailable {
		t.Fatal("model supplement must not claim a source")
	}
	if filtered[0].SourceTitle != "真实标题" || filtered[0].SourceExcerpt != "真实原文内容" {
		t.Fatal("citation metadata must be derived from the selected material")
	}
}

func TestCitationMarkersMustExistAndBeUnique(t *testing.T) {
	items := []citationPayload{{Marker: "[^1]"}, {Marker: "[^1]"}, {Marker: "[^2]"}}
	got := validateCitationMarkers("正文 [^1]", items)
	if len(got) != 1 || got[0].Marker != "[^1]" {
		t.Fatalf("unexpected citations: %#v", got)
	}
}

func TestAddingMaterialToTopicMarksItUsed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	topic := models.Topic{ID: "topic-a", UserID: "user-a", Title: "测试选题", Status: "idea"}
	note := models.Note{ID: "note-a", UserID: "user-a", Title: "测试素材", MaterialStatus: "distilled"}
	config.DB.Create(&topic)
	config.DB.Create(&note)

	payload, _ := json.Marshal(map[string]string{"noteId": note.ID})
	req := httptest.NewRequest(http.MethodPost, "/topics/topic-a/materials", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Params = gin.Params{{Key: "id", Value: topic.ID}}
	c.Set("userID", topic.UserID)
	AddTopicMaterial(c)

	if w.Code != http.StatusOK {
		t.Fatalf("add material: %d %s", w.Code, w.Body.String())
	}
	config.DB.First(&note, "id = ?", note.ID)
	if note.MaterialStatus != "used" {
		t.Fatalf("expected material status used, got %q", note.MaterialStatus)
	}
}
