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
	LLMProvider   string `json:"llmProvider" gorm:"default:'ollama'"`
	OpenAIBaseURL string `json:"openAiBaseUrl"`
	OpenAIKey     string `json:"openAiKey"`
	OpenAIModel   string `json:"openAiModel"`

	Notebooks   []Notebook   `json:"notebooks,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	Notes       []Note       `json:"notes,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	Tags        []Tag        `json:"tags,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	AiUsageLogs []AiUsageLog `json:"aiUsageLogs,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
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
	ID          string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	UserID      string    `json:"userId" gorm:"not null;index"`
	NotebookID  *string   `json:"notebookId" gorm:"index"`
	Title       string    `json:"title" gorm:"default:Untitled"`
	ContentJSON string    `json:"contentJson" gorm:"type:text"`  // Tiptap JSON content stored as text
	ContentText string    `json:"contentText" gorm:"type:text"`  // Plain text for full-text searching
	CoverImage  string    `json:"coverImage"`
	Icon        string    `json:"icon"`
	AudioURL    string    `json:"audioUrl"`
	Transcript  string    `json:"transcript" gorm:"type:text"`
	TranscriptSummary string `json:"transcriptSummary" gorm:"type:text"`
	WordCount   int       `json:"wordCount" gorm:"default:0"`
	IsPinned    bool      `json:"isPinned" gorm:"default:false"`
	IsTrashed   bool      `json:"isTrashed" gorm:"default:false"`
	Version     int       `json:"version" gorm:"default:1"`
	CreatedAt   time.Time `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"autoUpdateTime"`

	User     User      `json:"-" gorm:"foreignKey:UserID"`
	Notebook *Notebook `json:"notebook,omitempty" gorm:"foreignKey:NotebookID"`
	Tags     []NoteTag `json:"tags,omitempty" gorm:"foreignKey:NoteID"`
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
