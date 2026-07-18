package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/handlers"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
	"github.com/notavia/server/internal/services"
)

func main() {
	// Load configuration
	config.Load()
	if err := config.Validate(); err != nil {
		log.Fatal("Invalid configuration: ", err)
	}

	// Initialize database
	config.InitDB()

	// Initialize Yjs sync hub
	yjsHub := services.NewYjsHub()

	// Create Gin router
	r := gin.Default()
	if config.AppConfig.TrustedProxies == "" {
		_ = r.SetTrustedProxies(nil)
	} else {
		proxies := strings.Split(config.AppConfig.TrustedProxies, ",")
		for index := range proxies {
			proxies[index] = strings.TrimSpace(proxies[index])
		}
		if err := r.SetTrustedProxies(proxies); err != nil {
			log.Fatal("Invalid TRUSTED_PROXIES: ", err)
		}
	}

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{config.AppConfig.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// Private uploads: authentication and ownership are checked before serving.
	r.GET("/uploads/:filename", middleware.AuthMiddleware(), handlers.DownloadFile)

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"version": "0.1.0-alpha.1",
		})
	})

	// --- Yjs WebSocket Sync (public, auth via query param for WS) ---
	r.GET("/ws/yjs/:docId", middleware.AuthMiddleware(), func(c *gin.Context) {
		docID := c.Param("docId")
		var count int64
		config.DB.Model(&models.Note{}).Where("id = ? AND user_id = ?", docID, middleware.GetUserID(c)).Count(&count)
		if count == 0 {
			c.AbortWithStatusJSON(404, gin.H{"error": "note not found"})
			return
		}
		yjsHub.HandleConnection(c.Writer, c.Request, docID)
	})

	// --- API Routes ---
	api := r.Group("/api")

	// Auth (public)
	auth := api.Group("/auth")
	{
		auth.GET("/registration-status", handlers.RegistrationStatus)
		auth.POST("/register", handlers.Register)
		auth.POST("/login", handlers.Login)
		auth.POST("/logout", handlers.Logout)
		auth.GET("/me", middleware.AuthMiddleware(), handlers.GetMe)
		auth.PUT("/me/llm-config", middleware.AuthMiddleware(), handlers.UpdateLLMConfig)
		auth.PUT("/me/onboarding", middleware.AuthMiddleware(), handlers.CompleteOnboarding)
		auth.DELETE("/me", middleware.AuthMiddleware(), handlers.DeleteAccount)
	}

	// Protected routes
	protected := api.Group("")
	protected.Use(middleware.AuthMiddleware())
	{
		// Notes
		notes := protected.Group("/notes")
		{
			notes.POST("", handlers.CreateNote)
			notes.POST("/reindex", handlers.ReindexNotes)
			notes.POST("/clipper", handlers.WebClipper)
			notes.POST("/import", handlers.ImportNotes)
			notes.GET("/export", handlers.ExportNotes)
			notes.DELETE("/trash/empty", handlers.EmptyTrash)
			notes.GET("", handlers.GetNotes)
			notes.GET("/stats", handlers.GetStats)
			notes.GET("/:id", handlers.GetNote)
			notes.PUT("/:id", handlers.UpdateNote)
			notes.DELETE("/:id", handlers.TrashNote)
			notes.DELETE("/:id/permanent", handlers.DeleteNotePermanent)
			notes.POST("/:id/audio", handlers.UploadAudio)
			notes.POST("/:id/tags", handlers.AddTagToNote)
			notes.DELETE("/:id/tags/:tagId", handlers.RemoveTagFromNote)
		}

		// Notebooks
		notebooks := protected.Group("/notebooks")
		{
			notebooks.POST("", handlers.CreateNotebook)
			notebooks.GET("", handlers.GetNotebooks)
			notebooks.PUT("/:id", handlers.UpdateNotebook)
			notebooks.DELETE("/:id", handlers.DeleteNotebook)
		}

		// Files
		files := protected.Group("/files")
		{
			files.POST("/upload", handlers.UploadFile)
		}

		// AI
		ai := protected.Group("/ai")
		{
			ai.GET("/health", handlers.AIHealthCheck)
			ai.POST("/summarize", handlers.AISummarize)
			ai.POST("/extract", handlers.AIExtract)
			ai.POST("/continue", handlers.AIContinue)
			ai.POST("/rewrite", handlers.AIRewrite)
			ai.POST("/suggest-tags", handlers.AISuggestTags)
			ai.POST("/sprout", handlers.AISprout)
			ai.POST("/chat-with-notes", handlers.AIChatWithNotes)
			ai.POST("/chat", handlers.AIChat)
		}

		materials := protected.Group("/materials")
		{
			materials.GET("", handlers.ListMaterials)
			materials.PUT("/:id/source", handlers.UpdateMaterialSource)
		}

		topics := protected.Group("/topics")
		{
			topics.POST("", handlers.CreateTopic)
			topics.GET("", handlers.ListTopics)
			topics.GET("/:id", handlers.GetTopic)
			topics.PUT("/:id", handlers.UpdateTopic)
			topics.DELETE("/:id", handlers.DeleteTopic)
			topics.POST("/:id/materials", handlers.AddTopicMaterial)
			topics.DELETE("/:id/materials/:noteId", handlers.RemoveTopicMaterial)
		}

		works := protected.Group("/works")
		{
			works.POST("", handlers.CreateWork)
			works.GET("/:id", handlers.GetWork)
			works.PUT("/:id", handlers.UpdateWork)
			works.DELETE("/:id", handlers.DeleteWork)
		}

		creatorAI := protected.Group("/creator-ai")
		{
			creatorAI.POST("/retrieve", handlers.RetrieveCreatorMaterials)
			creatorAI.POST("/insights", handlers.ExtractMaterialInsights)
			creatorAI.GET("/insights/:noteId/status", handlers.GetMaterialInsightStatus)
			creatorAI.POST("/draft", handlers.GenerateCreatorDraft)
			creatorAI.POST("/style-review", handlers.ReviewCreatorStyle)
			creatorAI.POST("/transform", handlers.TransformCreatorWork)
		}

		protected.GET("/style-profile", handlers.GetStyleProfile)
		protected.PUT("/style-profile", handlers.UpdateStyleProfile)
		protected.POST("/publications", handlers.CreatePublication)
		protected.PUT("/publications/:id", handlers.UpdatePublication)
		protected.DELETE("/publications/:id", handlers.DeletePublication)
		protected.GET("/metrics/validation", handlers.ValidationMetrics)
	}

	r.GET("/static/:filename", middleware.AuthMiddleware(), handlers.DownloadAudioFile)

	// Start server
	addr := fmt.Sprintf(":%s", config.AppConfig.Port)
	fmt.Printf(`
╔══════════════════════════════════════════════╗
║        Notavia Creator Server v0.2.0         ║
║──────────────────────────────────────────────║
║  🌐 API:      http://localhost%s          ║
║  💾 Database:  %s                       ║
║  🤖 Ollama:    %s  ║
║  🔄 Yjs Sync:  ws://localhost%s/ws/yjs/*  ║
╚══════════════════════════════════════════════╝
`, addr, config.AppConfig.DBDriver, config.AppConfig.OllamaURL, addr)

	if err := r.Run(addr); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
