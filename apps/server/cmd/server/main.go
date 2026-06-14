package main

import (
	"fmt"
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/handlers"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/services"
)

func main() {
	// Load configuration
	config.Load()

	// Initialize database
	config.InitDB()

	// Initialize Yjs sync hub
	yjsHub := services.NewYjsHub()

	// Create Gin router
	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{config.AppConfig.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// Serve uploaded files as static assets
	r.Static("/uploads", config.AppConfig.UploadDir)

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":    "ok",
			"version":   "0.1.0",
			"dbDriver":  config.AppConfig.DBDriver,
			"ollamaUrl": config.AppConfig.OllamaURL,
			"yjsStats":  yjsHub.GetStats(),
		})
	})

	// --- Yjs WebSocket Sync (public, auth via query param for WS) ---
	r.GET("/ws/yjs/:docId", func(c *gin.Context) {
		docID := c.Param("docId")
		yjsHub.HandleConnection(c.Writer, c.Request, docID)
	})

	// --- API Routes ---
	api := r.Group("/api")

	// Auth (public)
	auth := api.Group("/auth")
	{
		auth.POST("/register", handlers.Register)
		auth.POST("/login", handlers.Login)
		auth.POST("/logout", handlers.Logout)
		auth.GET("/me", middleware.AuthMiddleware(), handlers.GetMe)
		auth.PUT("/me/llm-config", middleware.AuthMiddleware(), handlers.UpdateLLMConfig)
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
			notes.GET("/export", handlers.ExportNotes)
			notes.GET("", handlers.GetNotes)
			notes.GET("/stats", handlers.GetStats)
			notes.GET("/:id", handlers.GetNote)
			notes.PUT("/:id", handlers.UpdateNote)
			notes.DELETE("/:id", handlers.TrashNote)
			notes.POST("/:id/audio", handlers.UploadAudio)
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
	}

	// Serve static files from uploads
	r.Static("/static", "./uploads/audio")

	// Start server
	addr := fmt.Sprintf(":%s", config.AppConfig.Port)
	fmt.Printf(`
╔══════════════════════════════════════════════╗
║        NovaNote Private Server v0.1.0        ║
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

