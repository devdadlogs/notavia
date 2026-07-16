package handlers

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
	"gorm.io/gorm"
)

var topicStatuses = map[string]bool{"idea": true, "preparing": true, "writing": true, "ready": true, "published": true, "archived": true}
var platforms = map[string]bool{"zhihu": true, "xiaohongshu": true, "short_video": true}
var workStatuses = map[string]bool{"draft": true, "ready": true, "published": true, "archived": true}

func validTopicStatus(v string) bool { return topicStatuses[v] }
func validPlatform(v string) bool    { return platforms[v] }

type citationPayload struct {
	NoteID          string `json:"noteId"`
	Marker          string `json:"marker"`
	SourceTitle     string `json:"sourceTitle"`
	SourceExcerpt   string `json:"sourceExcerpt"`
	SourceAvailable bool   `json:"sourceAvailable"`
}

func filterCitations(items []citationPayload, selected map[string]models.Note) []citationPayload {
	out := make([]citationPayload, 0, len(items))
	for _, item := range items {
		if item.NoteID == "" {
			item.SourceAvailable = false
			out = append(out, item)
		} else if note, ok := selected[item.NoteID]; ok {
			item.SourceAvailable = true
			item.SourceTitle = note.Title
			source := note.ContentText + "\n" + note.Transcript
			if item.SourceExcerpt == "" || !strings.Contains(source, item.SourceExcerpt) {
				item.SourceExcerpt = truncateRunes(strings.TrimSpace(source), 240)
			}
			out = append(out, item)
		}
	}
	return out
}

func validateCitationMarkers(content string, items []citationPayload) []citationPayload {
	seen := map[string]bool{}
	out := make([]citationPayload, 0, len(items))
	for _, item := range items {
		if item.Marker == "" || seen[item.Marker] || !strings.Contains(content, item.Marker) {
			continue
		}
		seen[item.Marker] = true
		out = append(out, item)
	}
	return out
}

type topicInput struct {
	Title          string `json:"title" binding:"required"`
	CoreQuestion   string `json:"coreQuestion"`
	TargetAudience string `json:"targetAudience"`
	Conclusion     string `json:"conclusion"`
	DesiredAction  string `json:"desiredAction"`
	Status         string `json:"status"`
}

func CreateTopic(c *gin.Context) {
	var input topicInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if input.Status == "" {
		input.Status = "idea"
	}
	if !validTopicStatus(input.Status) {
		c.JSON(400, gin.H{"error": "invalid topic status"})
		return
	}
	t := models.Topic{ID: uuid.NewString(), UserID: middleware.GetUserID(c), Title: input.Title, CoreQuestion: input.CoreQuestion, TargetAudience: input.TargetAudience, Conclusion: input.Conclusion, DesiredAction: input.DesiredAction, Status: input.Status}
	if err := config.DB.Create(&t).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to create topic"})
		return
	}
	c.JSON(201, t)
}

func ListTopics(c *gin.Context) {
	var topics []models.Topic
	q := config.DB.Where("user_id = ?", middleware.GetUserID(c))
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if err := q.Preload("Materials.Note").Preload("Works").Order("updated_at DESC").Find(&topics).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to list topics"})
		return
	}
	c.JSON(200, topics)
}

func GetTopic(c *gin.Context) {
	var t models.Topic
	if err := config.DB.Where("id = ? AND user_id = ?", c.Param("id"), middleware.GetUserID(c)).Preload("Materials.Note").Preload("Works.Citations").Preload("Works.Publications").First(&t).Error; err != nil {
		c.JSON(404, gin.H{"error": "topic not found"})
		return
	}
	c.JSON(200, t)
}

func UpdateTopic(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var t models.Topic
	if err := config.DB.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&t).Error; err != nil {
		c.JSON(404, gin.H{"error": "topic not found"})
		return
	}
	var input topicInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if input.Status == "" {
		input.Status = t.Status
	}
	if !validTopicStatus(input.Status) {
		c.JSON(400, gin.H{"error": "invalid topic status"})
		return
	}
	if t.StartedAt == nil && input.Status == "writing" {
		now := time.Now()
		t.StartedAt = &now
	}
	t.Title, t.CoreQuestion, t.TargetAudience, t.Conclusion, t.DesiredAction, t.Status = input.Title, input.CoreQuestion, input.TargetAudience, input.Conclusion, input.DesiredAction, input.Status
	if err := config.DB.Save(&t).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to update topic"})
		return
	}
	c.JSON(200, t)
}

func DeleteTopic(c *gin.Context) {
	res := config.DB.Where("id = ? AND user_id = ?", c.Param("id"), middleware.GetUserID(c)).Delete(&models.Topic{})
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "topic not found"})
		return
	}
	c.Status(204)
}

func AddTopicMaterial(c *gin.Context) {
	userID, topicID := middleware.GetUserID(c), c.Param("id")
	var input struct {
		NoteID string `json:"noteId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	var count int64
	config.DB.Model(&models.Topic{}).Where("id = ? AND user_id = ?", topicID, userID).Count(&count)
	if count == 0 {
		c.JSON(404, gin.H{"error": "topic not found"})
		return
	}
	config.DB.Model(&models.Note{}).Where("id = ? AND user_id = ? AND is_trashed = ?", input.NoteID, userID, false).Count(&count)
	if count == 0 {
		c.JSON(404, gin.H{"error": "material not found"})
		return
	}
	link := models.TopicMaterial{TopicID: topicID, NoteID: input.NoteID}
	if err := config.DB.FirstOrCreate(&link).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to add material"})
		return
	}
	config.DB.Preload("Note").First(&link, "topic_id = ? AND note_id = ?", topicID, input.NoteID)
	c.JSON(200, link)
}

func RemoveTopicMaterial(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var count int64
	config.DB.Model(&models.Topic{}).Where("id = ? AND user_id = ?", c.Param("id"), userID).Count(&count)
	if count == 0 {
		c.JSON(404, gin.H{"error": "topic not found"})
		return
	}
	config.DB.Where("topic_id = ? AND note_id = ?", c.Param("id"), c.Param("noteId")).Delete(&models.TopicMaterial{})
	c.Status(204)
}

type workInput struct {
	TopicID  string `json:"topicId"`
	ParentID string `json:"parentId"`
	Platform string `json:"platform"`
	Title    string `json:"title"`
	Content  string `json:"content"`
	Status   string `json:"status"`
}

func CreateWork(c *gin.Context) {
	var input workInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if !validPlatform(input.Platform) {
		c.JSON(400, gin.H{"error": "invalid platform"})
		return
	}
	userID := middleware.GetUserID(c)
	var count int64
	config.DB.Model(&models.Topic{}).Where("id = ? AND user_id = ?", input.TopicID, userID).Count(&count)
	if count == 0 {
		c.JSON(404, gin.H{"error": "topic not found"})
		return
	}
	var parent *string
	if input.ParentID != "" {
		var parentWork models.Work
		if err := config.DB.Where("id = ? AND user_id = ? AND topic_id = ? AND platform = ?", input.ParentID, userID, input.TopicID, "zhihu").First(&parentWork).Error; err != nil {
			c.JSON(400, gin.H{"error": "parent work must be this topic's Zhihu work"})
			return
		}
		parent = &input.ParentID
	}
	w := models.Work{ID: uuid.NewString(), UserID: userID, TopicID: input.TopicID, ParentID: parent, Platform: input.Platform, Title: input.Title, Content: input.Content, Status: "draft"}
	if err := config.DB.Create(&w).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to create work"})
		return
	}
	c.JSON(201, w)
}

func GetWork(c *gin.Context) {
	var w models.Work
	if err := config.DB.Where("id = ? AND user_id = ?", c.Param("id"), middleware.GetUserID(c)).Preload("Citations").Preload("Publications").First(&w).Error; err != nil {
		c.JSON(404, gin.H{"error": "work not found"})
		return
	}
	c.JSON(200, w)
}

func UpdateWork(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var w models.Work
	if err := config.DB.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&w).Error; err != nil {
		c.JSON(404, gin.H{"error": "work not found"})
		return
	}
	var input struct {
		Title               *string `json:"title"`
		Content             *string `json:"content"`
		Status              *string `json:"status"`
		RevisionSummary     string  `json:"revisionSummary"`
		Preference          string  `json:"preference"`
		PreferenceConfirmed bool    `json:"preferenceConfirmed"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	status, title, content := w.Status, w.Title, w.Content
	if input.Status != nil {
		status = *input.Status
	}
	if input.Title != nil {
		title = *input.Title
	}
	if input.Content != nil {
		content = *input.Content
	}
	if !workStatuses[status] {
		c.JSON(400, gin.H{"error": "invalid work status"})
		return
	}
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		if content != w.Content {
			rev := models.Revision{ID: uuid.NewString(), WorkID: w.ID, UserID: userID, PreviousContent: w.Content, Content: content, Summary: input.RevisionSummary, Preference: input.Preference, PreferenceConfirmed: input.PreferenceConfirmed}
			if err := tx.Create(&rev).Error; err != nil {
				return err
			}
			if input.PreferenceConfirmed && strings.TrimSpace(input.Preference) != "" {
				profile := loadStyleProfile(userID)
				var rules []string
				_ = json.Unmarshal([]byte(profile.RulesJSON), &rules)
				rules = append(rules, strings.TrimSpace(input.Preference))
				encoded, _ := json.Marshal(uniqueStrings(rules))
				profile.RulesJSON = string(encoded)
				if err := tx.Save(&profile).Error; err != nil {
					return err
				}
			}
		}
		w.Title, w.Content, w.Status = title, content, status
		return tx.Save(&w).Error
	})
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to update work"})
		return
	}
	c.JSON(200, w)
}

func DeleteWork(c *gin.Context) {
	res := config.DB.Where("id = ? AND user_id = ?", c.Param("id"), middleware.GetUserID(c)).Delete(&models.Work{})
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "work not found"})
		return
	}
	c.Status(204)
}

func GetStyleProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var p models.StyleProfile
	if err := config.DB.Where("user_id = ?", userID).First(&p).Error; err != nil {
		rules, _ := json.Marshal([]string{"观点明确，直接给出结论", "表达自然，避免空话和重复"})
		p = models.StyleProfile{ID: uuid.NewString(), UserID: userID, RulesJSON: string(rules), BannedPhrasesJSON: "[]"}
		config.DB.Create(&p)
	}
	c.JSON(200, p)
}

func UpdateStyleProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input models.StyleProfile
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	var p models.StyleProfile
	if err := config.DB.Where("user_id = ?", userID).First(&p).Error; err != nil {
		p.ID, p.UserID = uuid.NewString(), userID
	}
	p.Biography, p.Positioning, p.RulesJSON, p.BannedPhrasesJSON = input.Biography, input.Positioning, input.RulesJSON, input.BannedPhrasesJSON
	if err := config.DB.Save(&p).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to save style profile"})
		return
	}
	c.JSON(200, p)
}

func CreatePublication(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input models.Publication
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if !map[string]bool{"zhihu": true, "xiaohongshu": true, "bilibili": true, "douyin": true, "wechat_video": true}[input.Platform] || input.Views < 0 || input.Likes < 0 || input.Favorites < 0 || input.Comments < 0 {
		c.JSON(400, gin.H{"error": "invalid publication data"})
		return
	}
	var count int64
	config.DB.Model(&models.Work{}).Where("id = ? AND user_id = ?", input.WorkID, userID).Count(&count)
	if count == 0 {
		c.JSON(404, gin.H{"error": "work not found"})
		return
	}
	input.ID, input.UserID = uuid.NewString(), userID
	if input.PublishedAt.IsZero() {
		input.PublishedAt = time.Now()
	}
	if err := config.DB.Create(&input).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to record publication"})
		return
	}
	c.JSON(201, input)
}

func UpdatePublication(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var existing models.Publication
	if err := config.DB.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&existing).Error; err != nil {
		c.JSON(404, gin.H{"error": "publication not found"})
		return
	}
	var input models.Publication
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	existing.Platform, existing.URL, existing.PublishedAt, existing.Views, existing.Likes, existing.Favorites, existing.Comments, existing.Notes = input.Platform, input.URL, input.PublishedAt, input.Views, input.Likes, input.Favorites, input.Comments, input.Notes
	config.DB.Save(&existing)
	c.JSON(200, existing)
}

func DeletePublication(c *gin.Context) {
	config.DB.Where("id = ? AND user_id = ?", c.Param("id"), middleware.GetUserID(c)).Delete(&models.Publication{})
	c.Status(204)
}

func ValidationMetrics(c *gin.Context) {
	userID := middleware.GetUserID(c)
	since := time.Now().AddDate(0, 0, -30)
	var topics []models.Topic
	config.DB.Where("user_id = ? AND updated_at >= ?", userID, since).Find(&topics)
	days := map[string]bool{}
	for _, t := range topics {
		days[t.UpdatedAt.Format("2006-01-02")] = true
	}
	var completed int64
	config.DB.Model(&models.Work{}).Where("user_id = ? AND status IN ? AND updated_at >= ?", userID, []string{"ready", "published"}, since).Count(&completed)
	var revisions []models.Revision
	config.DB.Where("user_id = ? AND created_at >= ?", userID, since).Find(&revisions)
	var totalRetention float64
	for _, rev := range revisions {
		if rev.PreviousContent != "" {
			totalRetention += textRetention(rev.PreviousContent, rev.Content)
		}
	}
	retention := float64(0)
	if len(revisions) > 0 {
		retention = totalRetention / float64(len(revisions))
	}
	var durations []float64
	for _, topic := range topics {
		if topic.StartedAt == nil {
			continue
		}
		var firstReady models.Work
		if err := config.DB.Where("topic_id = ? AND user_id = ? AND status IN ?", topic.ID, userID, []string{"ready", "published"}).Order("updated_at ASC").First(&firstReady).Error; err == nil {
			durations = append(durations, firstReady.UpdatedAt.Sub(*topic.StartedAt).Minutes())
		}
	}
	averageMinutes := float64(0)
	for _, d := range durations {
		averageMinutes += d
	}
	if len(durations) > 0 {
		averageMinutes /= float64(len(durations))
	}
	c.JSON(200, gin.H{"activeDays": len(days), "completedWorks": completed, "aiRetentionRate": retention, "averageCreationMinutes": averageMinutes, "windowDays": 30})
}

func textRetention(a, b string) float64 {
	aw := strings.Fields(a)
	if len(aw) == 0 {
		return 0
	}
	bset := map[string]bool{}
	for _, w := range strings.Fields(b) {
		bset[w] = true
	}
	kept := 0
	for _, w := range aw {
		if bset[w] {
			kept++
		}
	}
	return float64(kept) / float64(len(aw))
}

func ListMaterials(c *gin.Context) {
	userID, query, sourceType := middleware.GetUserID(c), strings.TrimSpace(c.Query("q")), c.Query("sourceType")
	var notes []models.Note
	db := config.DB.Where("user_id = ? AND is_trashed = ?", userID, false)
	if sourceType != "" {
		db = db.Where("source_type = ?", sourceType)
	}
	if query != "" {
		like := "%" + query + "%"
		db = db.Where("title LIKE ? OR content_text LIKE ? OR transcript LIKE ?", like, like, like)
	}
	db.Preload("Tags.Tag").Order("updated_at DESC").Limit(100).Find(&notes)
	c.JSON(200, notes)
}

func UpdateMaterialSource(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input struct{ SourceType, SourceURL string }
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	res := config.DB.Model(&models.Note{}).Where("id = ? AND user_id = ?", c.Param("id"), userID).Updates(map[string]any{"source_type": input.SourceType, "source_url": input.SourceURL})
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "material not found"})
		return
	}
	var note models.Note
	config.DB.First(&note, "id = ?", c.Param("id"))
	c.JSON(200, note)
}

type rankedMaterial struct {
	models.Note
	Score  float64 `json:"score"`
	Reason string  `json:"reason"`
}

func keywordMaterials(userID, query string, limit int) []rankedMaterial {
	var notes []models.Note
	config.DB.Where("user_id = ? AND is_trashed = ?", userID, false).Order("updated_at DESC").Limit(300).Find(&notes)
	terms := strings.Fields(strings.ToLower(query))
	out := []rankedMaterial{}
	for _, n := range notes {
		hay := strings.ToLower(n.Title + " " + n.ContentText + " " + n.Transcript)
		hits := 0
		for _, term := range terms {
			if strings.Contains(hay, term) {
				hits++
			}
		}
		if hits > 0 {
			out = append(out, rankedMaterial{Note: n, Score: float64(hits) / float64(max(1, len(terms))), Reason: fmt.Sprintf("命中 %d 个关键词", hits)})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}
