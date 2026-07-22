package models

import (
	"time"
)

type PlanType string

const (
	PlanFree PlanType = "FREE"
	PlanPro  PlanType = "PRO"
	PlanTeam PlanType = "TEAM"
)

type User struct {
	ID           string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	Email        string    `json:"email" gorm:"uniqueIndex;not null"`
	Password     string    `json:"-" gorm:"not null"` // Never expose in JSON
	Name         string    `json:"name"`
	AvatarURL    string    `json:"avatarUrl"`
	Plan         PlanType  `json:"plan" gorm:"default:FREE"`
	AIUsageCount int       `json:"aiUsageCount" gorm:"default:0"`
	CreatedAt    time.Time `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt    time.Time `json:"updatedAt" gorm:"autoUpdateTime"`

	// LLM Configuration
	LLMProvider           string     `json:"llmProvider" gorm:"default:'ollama'"`
	OpenAIBaseURL         string     `json:"openAiBaseUrl"`
	OpenAIKey             string     `json:"-"`
	OpenAIKeyCiphertext   string     `json:"-" gorm:"type:text"`
	OpenAIKeyHint         string     `json:"-" gorm:"type:varchar(8)"`
	OpenAIModel           string     `json:"openAiModel"`
	TermsVersion          string     `json:"termsVersion"`
	PrivacyVersion        string     `json:"privacyVersion"`
	LegalAcceptedAt       *time.Time `json:"legalAcceptedAt"`
	OnboardingCompletedAt *time.Time `json:"onboardingCompletedAt"`
	CloudAIConsentVersion string     `json:"cloudAiConsentVersion"`
	CloudAIConsentAt      *time.Time `json:"cloudAiConsentAt"`

	Notebooks   []Notebook   `json:"notebooks,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	Notes       []Note       `json:"notes,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	Tags        []Tag        `json:"tags,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	AiUsageLogs []AiUsageLog `json:"aiUsageLogs,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

// InstanceOwner is a singleton claim used to make first-user registration atomic.
type InstanceOwner struct {
	ID        string    `json:"-" gorm:"primaryKey;type:varchar(16)"`
	UserID    string    `json:"userId" gorm:"uniqueIndex;not null;type:varchar(36)"`
	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime"`
}

type LegalAcceptance struct {
	ID             string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID         string    `json:"userId" gorm:"not null;index"`
	TermsVersion   string    `json:"termsVersion" gorm:"not null"`
	PrivacyVersion string    `json:"privacyVersion" gorm:"not null"`
	AcceptedAt     time.Time `json:"acceptedAt" gorm:"autoCreateTime"`
}

type Notebook struct {
	ID           string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID       string    `json:"userId" gorm:"not null;index"`
	Name         string    `json:"name" gorm:"not null"`
	ParentID     *string   `json:"parentId" gorm:"index"` // For nested notebooks
	Icon         string    `json:"icon"`
	Color        string    `json:"color"`
	IsAIDisabled bool      `json:"isAiDisabled" gorm:"default:false"`
	Order        int       `json:"order" gorm:"default:0"`
	CreatedAt    time.Time `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt    time.Time `json:"updatedAt" gorm:"autoUpdateTime"`

	User     User       `json:"-" gorm:"foreignKey:UserID"`
	Parent   *Notebook  `json:"parent,omitempty" gorm:"foreignKey:ParentID"`
	Children []Notebook `json:"children,omitempty" gorm:"foreignKey:ParentID"`
	Notes    []Note     `json:"notes,omitempty" gorm:"foreignKey:NotebookID"`
}

type Note struct {
	ID                string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID            string    `json:"userId" gorm:"not null;index"`
	NotebookID        *string   `json:"notebookId" gorm:"index"`
	Title             string    `json:"title" gorm:"default:Untitled"`
	ContentJSON       string    `json:"contentJson" gorm:"type:text"` // Tiptap JSON content stored as text
	ContentText       string    `json:"contentText" gorm:"type:text"` // Plain text for full-text searching
	CoverImage        string    `json:"coverImage"`
	Icon              string    `json:"icon"`
	AudioURL          string    `json:"audioUrl"`
	Transcript        string    `json:"transcript" gorm:"type:text"`
	TranscriptSummary string    `json:"transcriptSummary" gorm:"type:text"`
	SourceType        string    `json:"sourceType" gorm:"default:'manual';index"`
	SourceURL         string    `json:"sourceUrl" gorm:"type:text"`
	SourceHTML        string    `json:"sourceHtml" gorm:"type:text"`
	CreatorNotes      string    `json:"creatorNotes" gorm:"type:text"`
	MaterialStatus    string    `json:"materialStatus" gorm:"default:'inbox';index"`
	WordCount         int       `json:"wordCount" gorm:"default:0"`
	IsPinned          bool      `json:"isPinned" gorm:"default:false"`
	IsTrashed         bool      `json:"isTrashed" gorm:"default:false"`
	Version           int       `json:"version" gorm:"default:1"`
	CreatedAt         time.Time `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt         time.Time `json:"updatedAt" gorm:"autoUpdateTime"`

	User     User              `json:"-" gorm:"foreignKey:UserID"`
	Notebook *Notebook         `json:"notebook,omitempty" gorm:"foreignKey:NotebookID"`
	Tags     []NoteTag         `json:"tags,omitempty" gorm:"foreignKey:NoteID"`
	Insights []MaterialInsight `json:"insights,omitempty" gorm:"foreignKey:NoteID;constraint:OnDelete:CASCADE"`
	Ideas    []MaterialIdea    `json:"ideas,omitempty" gorm:"foreignKey:NoteID;constraint:OnDelete:CASCADE"`
}

type Topic struct {
	ID             string          `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID         string          `json:"userId" gorm:"not null;index"`
	Title          string          `json:"title" gorm:"not null"`
	CoreQuestion   string          `json:"coreQuestion" gorm:"type:text"`
	TargetAudience string          `json:"targetAudience" gorm:"type:text"`
	Conclusion     string          `json:"conclusion" gorm:"type:text"`
	DesiredAction  string          `json:"desiredAction" gorm:"type:text"`
	Status         string          `json:"status" gorm:"default:'idea';index"`
	StartedAt      *time.Time      `json:"startedAt"`
	CreatedAt      time.Time       `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt      time.Time       `json:"updatedAt" gorm:"autoUpdateTime"`
	Materials      []TopicMaterial `json:"materials,omitempty" gorm:"foreignKey:TopicID;constraint:OnDelete:CASCADE"`
	Ideas          []TopicIdea     `json:"ideas,omitempty" gorm:"foreignKey:TopicID;constraint:OnDelete:CASCADE"`
	Works          []Work          `json:"works,omitempty" gorm:"foreignKey:TopicID;constraint:OnDelete:CASCADE"`
}

type TopicMaterial struct {
	TopicID   string    `json:"topicId" gorm:"primaryKey;type:varchar(36)"`
	NoteID    string    `json:"noteId" gorm:"primaryKey;type:varchar(36);index"`
	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime"`
	Note      Note      `json:"note,omitempty" gorm:"foreignKey:NoteID"`
}

type MaterialIdea struct {
	ID            string              `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID        string              `json:"userId" gorm:"not null;index"`
	NoteID        string              `json:"noteId" gorm:"not null;index"`
	SourceTitle   string              `json:"sourceTitle,omitempty" gorm:"-"`
	Content       string              `json:"content" gorm:"type:text;not null"`
	SourceExcerpt string              `json:"sourceExcerpt" gorm:"type:text"`
	CreatedAt     time.Time           `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt     time.Time           `json:"updatedAt" gorm:"autoUpdateTime"`
	TopicLinks    []MaterialIdeaTopic `json:"topicLinks,omitempty" gorm:"-"`
}

type MaterialIdeaTopic struct {
	TopicID string `json:"topicId"`
	Title   string `json:"title"`
}

type TopicIdea struct {
	TopicID   string       `json:"topicId" gorm:"primaryKey;type:varchar(36)"`
	IdeaID    string       `json:"ideaId" gorm:"primaryKey;type:varchar(36);index"`
	CreatedAt time.Time    `json:"createdAt" gorm:"autoCreateTime"`
	Idea      MaterialIdea `json:"idea,omitempty" gorm:"foreignKey:IdeaID"`
}

type Work struct {
	ID       string  `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID   string  `json:"userId" gorm:"not null;index"`
	TopicID  string  `json:"topicId" gorm:"not null;index"`
	ParentID *string `json:"parentId" gorm:"index"`
	Platform string  `json:"platform" gorm:"not null;index"`
	Title    string  `json:"title"`
	Content  string  `json:"content" gorm:"type:text"`
	// ContentJSON keeps the editor document intact (tables, images and video
	// nodes). Content remains the Markdown/plain-text representation used by
	// search, AI prompts and exports.
	ContentJSON  string        `json:"contentJson" gorm:"type:text"`
	Status       string        `json:"status" gorm:"default:'draft';index"`
	AIGenerated  string        `json:"aiGenerated" gorm:"type:text"`
	CreatedAt    time.Time     `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt    time.Time     `json:"updatedAt" gorm:"autoUpdateTime"`
	Citations    []Citation    `json:"citations,omitempty" gorm:"foreignKey:WorkID;constraint:OnDelete:CASCADE"`
	Publications []Publication `json:"publications,omitempty" gorm:"foreignKey:WorkID;constraint:OnDelete:CASCADE"`
}

type Citation struct {
	ID              string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	WorkID          string    `json:"workId" gorm:"not null;index"`
	NoteID          *string   `json:"noteId" gorm:"index"`
	Marker          string    `json:"marker"`
	SourceTitle     string    `json:"sourceTitle"`
	SourceExcerpt   string    `json:"sourceExcerpt" gorm:"type:text"`
	SourceAvailable bool      `json:"sourceAvailable" gorm:"default:true"`
	CreatedAt       time.Time `json:"createdAt" gorm:"autoCreateTime"`
}

type StyleProfile struct {
	ID                string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID            string    `json:"userId" gorm:"not null;uniqueIndex"`
	Biography         string    `json:"biography" gorm:"type:text"`
	Positioning       string    `json:"positioning" gorm:"type:text"`
	RulesJSON         string    `json:"rulesJson" gorm:"type:text"`
	BannedPhrasesJSON string    `json:"bannedPhrasesJson" gorm:"type:text"`
	CreatedAt         time.Time `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt         time.Time `json:"updatedAt" gorm:"autoUpdateTime"`
}

type Revision struct {
	ID                  string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	WorkID              string    `json:"workId" gorm:"not null;index"`
	UserID              string    `json:"userId" gorm:"not null;index"`
	PreviousContent     string    `json:"previousContent" gorm:"type:text"`
	Content             string    `json:"content" gorm:"type:text"`
	Summary             string    `json:"summary" gorm:"type:text"`
	Preference          string    `json:"preference" gorm:"type:text"`
	PreferenceConfirmed bool      `json:"preferenceConfirmed" gorm:"default:false"`
	CreatedAt           time.Time `json:"createdAt" gorm:"autoCreateTime"`
}

type Publication struct {
	ID          string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID      string    `json:"userId" gorm:"not null;index"`
	WorkID      string    `json:"workId" gorm:"not null;index"`
	Platform    string    `json:"platform" gorm:"not null;index"`
	URL         string    `json:"url" gorm:"type:text"`
	PublishedAt time.Time `json:"publishedAt"`
	Views       int       `json:"views"`
	Likes       int       `json:"likes"`
	Favorites   int       `json:"favorites"`
	Comments    int       `json:"comments"`
	Notes       string    `json:"notes" gorm:"type:text"`
	CreatedAt   time.Time `json:"createdAt" gorm:"autoCreateTime"`
}

type MaterialInsight struct {
	ID        string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID    string    `json:"userId" gorm:"not null;index"`
	NoteID    string    `json:"noteId" gorm:"not null;index"`
	Type      string    `json:"type" gorm:"not null;index"`
	Content   string    `json:"content" gorm:"type:text"`
	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime"`
}

type UploadedFile struct {
	ID        string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID    string    `json:"userId" gorm:"not null;index"`
	Filename  string    `json:"filename" gorm:"not null;uniqueIndex"`
	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime"`
}

type Tag struct {
	ID        string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID    string    `json:"userId" gorm:"not null;uniqueIndex:idx_user_tag"`
	Name      string    `json:"name" gorm:"not null;uniqueIndex:idx_user_tag"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime"`

	User  User      `json:"-" gorm:"foreignKey:UserID"`
	Notes []NoteTag `json:"notes,omitempty" gorm:"foreignKey:TagID"`
}

type NoteTag struct {
	NoteID     string    `json:"noteId" gorm:"primaryKey;type:varchar(36)"`
	TagID      string    `json:"tagId" gorm:"primaryKey;type:varchar(36)"`
	AssignedAt time.Time `json:"assignedAt" gorm:"autoCreateTime"`

	Note Note `json:"-" gorm:"foreignKey:NoteID;constraint:OnDelete:CASCADE"`
	Tag  Tag  `json:"tag,omitempty" gorm:"foreignKey:TagID;constraint:OnDelete:CASCADE"`
}

type AiUsageLog struct {
	ID         string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID     string    `json:"userId" gorm:"not null;index"`
	ActionType string    `json:"actionType" gorm:"not null"` // 'summarize', 'continue', 'rewrite', 'search'
	TokensUsed int       `json:"tokensUsed"`
	CreatedAt  time.Time `json:"createdAt" gorm:"autoCreateTime"`

	User User `json:"-" gorm:"foreignKey:UserID"`
}
