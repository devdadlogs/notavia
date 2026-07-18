package config

import (
	"fmt"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/notavia/server/internal/credential"
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
		&models.InstanceOwner{},
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

	var ownerCount int64
	DB.Model(&models.InstanceOwner{}).Where("id = ?", "owner").Count(&ownerCount)
	if ownerCount == 0 {
		var oldest models.User
		if err := DB.Order("created_at ASC").First(&oldest).Error; err == nil {
			if err := DB.Create(&models.InstanceOwner{ID: "owner", UserID: oldest.ID}).Error; err != nil {
				log.Fatalf("Failed to assign instance owner: %v", err)
			}
		}
	}
	if AppConfig.CredentialEncryptionKey != "" {
		cipher, err := credential.NewCipher(AppConfig.CredentialEncryptionKey)
		if err != nil {
			log.Fatalf("Invalid credential encryption key: %v", err)
		}
		if err := migrateCloudCredentials(DB, cipher); err != nil {
			log.Fatalf("Failed to validate or migrate cloud credentials: %v", err)
		}
	}

	fmt.Println("✅ Database migration complete")
}

func migrateCloudCredentials(db *gorm.DB, cipher *credential.Cipher) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var encryptedUsers []models.User
		if err := tx.Where("open_ai_key_ciphertext <> ''").Find(&encryptedUsers).Error; err != nil {
			return err
		}
		for _, user := range encryptedUsers {
			if _, err := cipher.Decrypt(user.OpenAIKeyCiphertext); err != nil {
				return fmt.Errorf("credential for user %s cannot be decrypted with the configured key: %w", user.ID, err)
			}
		}

		var plainUsers []models.User
		if err := tx.Where("open_ai_key <> '' AND open_ai_key_ciphertext = ''").Find(&plainUsers).Error; err != nil {
			return err
		}
		for _, user := range plainUsers {
			encrypted, err := cipher.Encrypt(user.OpenAIKey)
			if err != nil {
				return err
			}
			hint := user.OpenAIKey
			if len(hint) > 4 {
				hint = hint[len(hint)-4:]
			} else {
				hint = ""
			}
			if err := tx.Model(&models.User{}).Where("id = ?", user.ID).Updates(map[string]any{"open_ai_key_ciphertext": encrypted, "open_ai_key": "", "open_ai_key_hint": hint}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
