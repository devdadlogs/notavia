package config

import (
	"fmt"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/notavia/server/internal/models"
)

var DB *gorm.DB

func InitDB() {
	var err error
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	}

	switch AppConfig.DBDriver {
	case "postgres":
		if AppConfig.DBDSN == "" {
			log.Fatal("DATABASE_URL is required when DB_DRIVER=postgres")
		}
		DB, err = gorm.Open(postgres.Open(AppConfig.DBDSN), gormConfig)
	default: // "sqlite"
		DB, err = gorm.Open(sqlite.Open(AppConfig.DBPath), gormConfig)
		if err == nil {
			// Enable WAL mode for better concurrent read performance
			DB.Exec("PRAGMA journal_mode=WAL")
			DB.Exec("PRAGMA synchronous=NORMAL")
			DB.Exec("PRAGMA foreign_keys=ON")
		}
	}

	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	fmt.Printf("✅ Database connected (%s)\n", AppConfig.DBDriver)

	// Auto-migrate all models
	err = DB.AutoMigrate(
		&models.User{},
		&models.Notebook{},
		&models.Note{},
		&models.Tag{},
		&models.NoteTag{},
		&models.AiUsageLog{},
		&models.Topic{}, &models.TopicMaterial{}, &models.Work{}, &models.Citation{},
		&models.StyleProfile{}, &models.Revision{}, &models.Publication{}, &models.MaterialInsight{},
		&models.UploadedFile{},
		&models.LegalAcceptance{},
	)
	if err != nil {
		log.Fatalf("Failed to auto-migrate: %v", err)
	}
	// Accounts that already had a creator profile before onboarding existed are
	// existing users. Keep their current workspace intact and do not force them
	// through the new-user flow.
	DB.Exec(`UPDATE users SET onboarding_completed_at = updated_at
		WHERE onboarding_completed_at IS NULL
		AND id IN (SELECT user_id FROM style_profiles WHERE biography <> '' OR positioning <> '')`)

	fmt.Println("✅ Database migration complete")
}
