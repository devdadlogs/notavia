package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/models"
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
	if err := db.AutoMigrate(&models.Topic{}, &models.TopicMaterial{}, &models.Note{}, &models.Work{}, &models.Citation{}, &models.Publication{}, &models.Revision{}); err != nil {
		t.Fatal(err)
	}
	config.DB = db
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
