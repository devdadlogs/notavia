package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port       string
	DBDriver   string // "sqlite" or "postgres"
	DBPath     string // SQLite file path
	DBDSN      string // PostgreSQL connection string
	JWTSecret  string
	OllamaURL  string
	UploadDir  string
	CORSOrigin string

	// LLM Provider Configuration
	LLMProvider   string // "ollama" or "openai"
	OpenAIBaseURL string
	OpenAIKey     string
	OpenAIModel   string
}

var AppConfig Config

func Load() {
	// Load .env file if exists
	_ = godotenv.Load()

	AppConfig = Config{
		Port:       getEnv("PORT", "3001"),
		DBDriver:   getEnv("DB_DRIVER", "sqlite"),
		DBPath:     getEnv("DB_PATH", "./data/notavia.db"),
		DBDSN:      getEnv("DATABASE_URL", ""),
		JWTSecret:  getEnv("JWT_SECRET", "notavia-dev-secret-change-in-production"),
		OllamaURL:  getEnv("OLLAMA_URL", "http://localhost:11434"),
		UploadDir:  getEnv("UPLOAD_DIR", "./data/uploads"),
		CORSOrigin: getEnv("CORS_ORIGIN", "http://localhost:5173"),

		LLMProvider:   getEnv("LLM_PROVIDER", "ollama"),
		OpenAIBaseURL: getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		OpenAIKey:     getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:   getEnv("OPENAI_MODEL", "gpt-4o-mini"),
	}

	// Ensure upload directory exists
	_ = os.MkdirAll(AppConfig.UploadDir, 0755)
	_ = os.MkdirAll("./data", 0755)
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}
