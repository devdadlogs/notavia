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
	if err := db.AutoMigrate(&models.Topic{}, &models.TopicMaterial{}, &models.Note{}, &models.MaterialIdea{}, &models.TopicIdea{}, &models.Work{}, &models.Citation{}, &models.Publication{}, &models.Revision{}, &models.StyleProfile{}, &models.MaterialInsight{}); err != nil {
		t.Fatal(err)
	}
	config.DB = db
}

func materialIdeaRequest(method, path, userID, materialID, ideaID string, body any, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Params = gin.Params{{Key: "id", Value: materialID}}
	if ideaID != "" {
		c.Params = append(c.Params, gin.Param{Key: "ideaId", Value: ideaID})
	}
	c.Set("userID", userID)
	handler(c)
	return w
}

func TestMaterialIdeasCanBeCreatedAndListed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	note := models.Note{ID: "note-ideas", UserID: "user-a", Title: "测试素材"}
	config.DB.Create(&note)

	w := materialIdeaRequest(http.MethodPost, "/materials/note-ideas/ideas", note.UserID, note.ID, "", map[string]string{
		"content":       "这是我的第一个判断",
		"sourceExcerpt": "这是原文摘录",
	}, CreateMaterialIdea)
	if w.Code != http.StatusCreated {
		t.Fatalf("create idea: %d %s", w.Code, w.Body.String())
	}
	var firstIdea models.MaterialIdea
	if err := json.Unmarshal(w.Body.Bytes(), &firstIdea); err != nil {
		t.Fatal(err)
	}
	topic := models.Topic{ID: "idea-topic", UserID: note.UserID, Title: "已经采用的选题", Status: "idea"}
	config.DB.Create(&topic)
	config.DB.Create(&models.TopicIdea{TopicID: topic.ID, IdeaID: firstIdea.ID})

	w = materialIdeaRequest(http.MethodPost, "/materials/note-ideas/ideas", note.UserID, note.ID, "", map[string]string{
		"content": "这是第二个想法",
	}, CreateMaterialIdea)
	if w.Code != http.StatusCreated {
		t.Fatalf("create second idea: %d %s", w.Code, w.Body.String())
	}

	w = materialIdeaRequest(http.MethodGet, "/materials/note-ideas/ideas", note.UserID, note.ID, "", nil, ListMaterialIdeas)
	if w.Code != http.StatusOK {
		t.Fatalf("list ideas: %d %s", w.Code, w.Body.String())
	}
	var ideas []models.MaterialIdea
	if err := json.Unmarshal(w.Body.Bytes(), &ideas); err != nil {
		t.Fatal(err)
	}
	if len(ideas) != 2 {
		t.Fatalf("unexpected ideas: %#v", ideas)
	}
	byContent := map[string]models.MaterialIdea{}
	for _, idea := range ideas {
		byContent[idea.Content] = idea
	}
	if byContent["这是我的第一个判断"].SourceExcerpt != "这是原文摘录" || byContent["这是第二个想法"].ID == "" {
		t.Fatalf("unexpected ideas: %#v", ideas)
	}
	if links := byContent["这是我的第一个判断"].TopicLinks; len(links) != 1 || links[0].TopicID != topic.ID || links[0].Title != topic.Title {
		t.Fatalf("idea topic links missing: %#v", links)
	}
}

func TestMaterialIdeasCanOnlyBeChangedByTheirOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	note := models.Note{ID: "owned-note", UserID: "owner", Title: "测试素材"}
	idea := models.MaterialIdea{ID: "owned-idea", UserID: note.UserID, NoteID: note.ID, Content: "原想法"}
	config.DB.Create(&note)
	config.DB.Create(&idea)

	w := materialIdeaRequest(http.MethodPut, "/materials/owned-note/ideas/owned-idea", "other-user", note.ID, idea.ID, map[string]string{"content": "越权修改"}, UpdateMaterialIdea)
	if w.Code != http.StatusNotFound {
		t.Fatalf("other user must not update idea, got %d %s", w.Code, w.Body.String())
	}
	w = materialIdeaRequest(http.MethodDelete, "/materials/owned-note/ideas/owned-idea", "other-user", note.ID, idea.ID, nil, DeleteMaterialIdea)
	if w.Code != http.StatusNotFound {
		t.Fatalf("other user must not delete idea, got %d %s", w.Code, w.Body.String())
	}

	w = materialIdeaRequest(http.MethodPut, "/materials/owned-note/ideas/owned-idea", note.UserID, note.ID, idea.ID, map[string]string{"content": "修改后的想法", "sourceExcerpt": "对应原文"}, UpdateMaterialIdea)
	if w.Code != http.StatusOK {
		t.Fatalf("owner update: %d %s", w.Code, w.Body.String())
	}
	w = materialIdeaRequest(http.MethodDelete, "/materials/owned-note/ideas/owned-idea", note.UserID, note.ID, idea.ID, nil, DeleteMaterialIdea)
	if w.Code != http.StatusNoContent {
		t.Fatalf("owner delete: %d %s", w.Code, w.Body.String())
	}
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

type topicSuggestionProvider struct{}

func (p *topicSuggestionProvider) CheckHealth() (bool, error)      { return true, nil }
func (p *topicSuggestionProvider) ListModels() ([]string, error)   { return nil, nil }
func (p *topicSuggestionProvider) Generate(string) (string, error) { return "", nil }
func (p *topicSuggestionProvider) GenerateJSON(string) (string, error) {
	return `{"title":"善良会让人贫穷吗","coreQuestion":"善良和贫穷真的存在因果关系吗？","targetAudience":"容易把善良与吃亏混为一谈的普通人","conclusion":"善良不会直接导致贫穷，缺少边界和能力才会。","desiredAction":"重新区分善良、边界和生存能力。","reason":"素材里的具体事件与个人判断形成了可讨论的冲突。"}`, nil
}
func (p *topicSuggestionProvider) GenerateStream(string, chan<- string, chan<- error) {}
func (p *topicSuggestionProvider) Embed(string) ([]float32, error)                    { return nil, nil }
func (p *topicSuggestionProvider) TranscribeAudio(string) (string, error)             { return "", nil }

func TestSuggestTopicBriefUsesOwnedTopicContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	topic := models.Topic{ID: "suggest-topic", UserID: "user-a", Title: "暂定标题", Status: "idea"}
	note := models.Note{ID: "suggest-note", UserID: topic.UserID, Title: "菜摊老人", ContentText: "一位老人坚持把卖不完的菜送给更困难的人。"}
	idea := models.MaterialIdea{ID: "suggest-idea", UserID: topic.UserID, NoteID: note.ID, Content: "善良需要边界和生存能力。"}
	config.DB.Create(&topic)
	config.DB.Create(&note)
	config.DB.Create(&idea)
	config.DB.Create(&models.TopicMaterial{TopicID: topic.ID, NoteID: note.ID})
	config.DB.Create(&models.TopicIdea{TopicID: topic.ID, IdeaID: idea.ID})

	originalProvider := creatorTopicSuggestionProvider
	creatorTopicSuggestionProvider = func(string) services.LLMProvider { return &topicSuggestionProvider{} }
	t.Cleanup(func() { creatorTopicSuggestionProvider = originalProvider })

	w := creatorRequest(http.MethodPost, "/creator-ai/topic-brief", topic.UserID, map[string]string{"topicId": topic.ID}, SuggestTopicBrief)
	if w.Code != http.StatusOK {
		t.Fatalf("suggest topic brief: %d %s", w.Code, w.Body.String())
	}
	var brief map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &brief); err != nil {
		t.Fatal(err)
	}
	if brief["coreQuestion"] == "" || brief["conclusion"] == "" || brief["reason"] == "" {
		t.Fatalf("incomplete topic brief: %#v", brief)
	}

	w = creatorRequest(http.MethodPost, "/creator-ai/topic-brief", "user-b", map[string]string{"topicId": topic.ID}, SuggestTopicBrief)
	if w.Code != http.StatusNotFound {
		t.Fatalf("other user must not use topic context, got %d %s", w.Code, w.Body.String())
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

func TestAddingIdeaToTopicAlsoAddsItsMaterial(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	topic := models.Topic{ID: "topic-with-idea", UserID: "user-a", Title: "测试选题", Status: "idea"}
	note := models.Note{ID: "idea-note", UserID: topic.UserID, Title: "测试素材", MaterialStatus: "distilled"}
	idea := models.MaterialIdea{ID: "idea-a", UserID: topic.UserID, NoteID: note.ID, Content: "值得继续写的判断"}
	config.DB.Create(&topic)
	config.DB.Create(&note)
	config.DB.Create(&idea)

	w := materialIdeaRequest(http.MethodPost, "/topics/topic-with-idea/ideas", topic.UserID, topic.ID, "", map[string]string{"ideaId": idea.ID}, AddTopicIdea)
	if w.Code != http.StatusOK {
		t.Fatalf("add idea: %d %s", w.Code, w.Body.String())
	}
	var ideaLinks, materialLinks int64
	config.DB.Model(&models.TopicIdea{}).Where("topic_id = ? AND idea_id = ?", topic.ID, idea.ID).Count(&ideaLinks)
	config.DB.Model(&models.TopicMaterial{}).Where("topic_id = ? AND note_id = ?", topic.ID, note.ID).Count(&materialLinks)
	if ideaLinks != 1 || materialLinks != 1 {
		t.Fatalf("expected idea and material links, got ideas=%d materials=%d", ideaLinks, materialLinks)
	}
	config.DB.First(&note, "id = ?", note.ID)
	if note.MaterialStatus != "used" {
		t.Fatalf("expected material status used, got %q", note.MaterialStatus)
	}
	w = materialIdeaRequest(http.MethodGet, "/topics/topic-with-idea", topic.UserID, topic.ID, "", nil, GetTopic)
	if w.Code != http.StatusOK {
		t.Fatalf("get topic: %d %s", w.Code, w.Body.String())
	}
	var loaded models.Topic
	if err := json.Unmarshal(w.Body.Bytes(), &loaded); err != nil {
		t.Fatal(err)
	}
	if len(loaded.Ideas) != 1 || loaded.Ideas[0].Idea.Content != idea.Content {
		t.Fatalf("topic did not include linked idea: %#v", loaded.Ideas)
	}
}

func TestRemovingMaterialFromTopicAlsoRemovesItsIdeaLinks(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCreatorTestDB(t)
	topic := models.Topic{ID: "topic-remove-material", UserID: "user-a", Title: "测试选题", Status: "idea"}
	note := models.Note{ID: "remove-note", UserID: topic.UserID, Title: "测试素材", MaterialStatus: "used"}
	idea := models.MaterialIdea{ID: "remove-idea", UserID: topic.UserID, NoteID: note.ID, Content: "关联想法"}
	config.DB.Create(&topic)
	config.DB.Create(&note)
	config.DB.Create(&idea)
	config.DB.Create(&models.TopicMaterial{TopicID: topic.ID, NoteID: note.ID})
	config.DB.Create(&models.TopicIdea{TopicID: topic.ID, IdeaID: idea.ID})

	w := materialIdeaRequest(http.MethodDelete, "/topics/topic-remove-material/materials/remove-note", topic.UserID, topic.ID, "", nil, func(c *gin.Context) {
		c.Params = append(c.Params, gin.Param{Key: "noteId", Value: note.ID})
		RemoveTopicMaterial(c)
	})
	if w.Code != http.StatusNoContent {
		t.Fatalf("remove material: %d %s", w.Code, w.Body.String())
	}
	var materialLinks, ideaLinks int64
	config.DB.Model(&models.TopicMaterial{}).Where("topic_id = ?", topic.ID).Count(&materialLinks)
	config.DB.Model(&models.TopicIdea{}).Where("topic_id = ?", topic.ID).Count(&ideaLinks)
	if materialLinks != 0 || ideaLinks != 0 {
		t.Fatalf("links were not removed: materials=%d ideas=%d", materialLinks, ideaLinks)
	}
}
