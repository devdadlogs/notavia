package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/notavia/server/internal/credential"
)

type Config struct {
	Port                    string
	DBDriver                string // "sqlite" or "postgres"
	DBPath                  string // SQLite file path
	DBDSN                   string // PostgreSQL connection string
	JWTSecret               string
	OllamaURL               string
	OllamaModel             string
	QdrantURL               string
	UploadDir               string
	CORSOrigin              string
	RegistrationMode        string
	CredentialEncryptionKey string
	AppEnv                  string
	TrustedProxies          string
	CookieSecure            string

	// LLM Provider Configuration
	LLMProvider   string // "ollama" or "openai"
	OpenAIBaseURL string
	OpenAIKey     string
	OpenAIModel   string

	WhisperBaseURL string
	WhisperAPIKey  string
	WhisperModel   string
}

var AppConfig Config

func Load() {
	// Load .env file if exists
	_ = godotenv.Load()

	AppConfig = Config{
		Port:                    getEnv("PORT", "3001"),
		DBDriver:                getEnv("DB_DRIVER", "sqlite"),
		DBPath:                  getEnv("DB_PATH", "./data/notavia.db"),
		DBDSN:                   getEnv("DATABASE_URL", ""),
		JWTSecret:               getEnv("JWT_SECRET", "notavia-dev-secret-change-in-production"),
		OllamaURL:               getEnv("OLLAMA_URL", "http://localhost:11434"),
		OllamaModel:             getEnv("OLLAMA_MODEL", "qwen2.5:1.5b"),
		QdrantURL:               getEnv("QDRANT_URL", "http://localhost:6333"),
		UploadDir:               getEnv("UPLOAD_DIR", "./data/uploads"),
		CORSOrigin:              getEnv("CORS_ORIGIN", "http://localhost:5173"),
		RegistrationMode:        getEnv("REGISTRATION_MODE", "first-user"),
		CredentialEncryptionKey: getEnv("CREDENTIAL_ENCRYPTION_KEY", ""),
		AppEnv:                  getEnv("APP_ENV", "development"),
		TrustedProxies:          getEnv("TRUSTED_PROXIES", ""),
		CookieSecure:            getEnv("COOKIE_SECURE", "auto"),

		LLMProvider:    getEnv("LLM_PROVIDER", "ollama"),
		OpenAIBaseURL:  getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		OpenAIKey:      getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:    getEnv("OPENAI_MODEL", "gpt-4o-mini"),
		WhisperBaseURL: getEnv("WHISPER_BASE_URL", "http://localhost:9005/v1"),
		WhisperAPIKey:  getEnv("WHISPER_API_KEY", ""),
		WhisperModel:   getEnv("WHISPER_MODEL", "whisper-1"),
	}

	// Ensure upload directory exists
	_ = os.MkdirAll(AppConfig.UploadDir, 0755)
	_ = os.MkdirAll("./data", 0755)
}

func Validate() error {
	if AppConfig.RegistrationMode != "first-user" && AppConfig.RegistrationMode != "open" && AppConfig.RegistrationMode != "closed" {
		return fmt.Errorf("REGISTRATION_MODE must be first-user, open, or closed")
	}
	if AppConfig.CookieSecure != "auto" && AppConfig.CookieSecure != "true" && AppConfig.CookieSecure != "false" {
		return fmt.Errorf("COOKIE_SECURE must be auto, true, or false")
	}
	if AppConfig.CredentialEncryptionKey != "" {
		if _, err := credential.NewCipher(AppConfig.CredentialEncryptionKey); err != nil {
			return err
		}
	}
	if AppConfig.AppEnv == "production" {
		if len(AppConfig.JWTSecret) < 32 || strings.Contains(AppConfig.JWTSecret, "change-in-production") {
			return fmt.Errorf("production JWT_SECRET must be at least 32 characters and not use the development default")
		}
		if AppConfig.CredentialEncryptionKey == "" {
			return fmt.Errorf("CREDENTIAL_ENCRYPTION_KEY is required in production")
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}
