package config

import (
	"encoding/base64"
	"testing"

	"github.com/notavia/server/internal/credential"
	"github.com/notavia/server/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestProductionConfigurationRejectsDevelopmentSecrets(t *testing.T) {
	previous := AppConfig
	t.Cleanup(func() { AppConfig = previous })
	AppConfig = Config{
		AppEnv:                  "production",
		RegistrationMode:        "first-user",
		CookieSecure:            "auto",
		JWTSecret:               "notavia-dev-secret-change-in-production",
		CredentialEncryptionKey: "",
	}
	if err := Validate(); err == nil {
		t.Fatal("production configuration accepted development secrets")
	}
}

func TestCloudCredentialMigrationEncryptsPlaintext(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatal(err)
	}
	user := models.User{ID: "legacy-user", Email: "legacy@example.com", Password: "hash", OpenAIKey: "sk-legacy-secret"}
	db.Create(&user)
	cipher, _ := credential.NewCipher(base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")))
	if err := migrateCloudCredentials(db, cipher); err != nil {
		t.Fatal(err)
	}
	db.First(&user, "id = ?", user.ID)
	plain, err := cipher.Decrypt(user.OpenAIKeyCiphertext)
	if err != nil || plain != "sk-legacy-secret" || user.OpenAIKey != "" {
		t.Fatalf("credential migration failed: plaintext=%q old=%q err=%v", plain, user.OpenAIKey, err)
	}
}

func TestCloudCredentialMigrationRejectsWrongKey(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	db.AutoMigrate(&models.User{})
	first, _ := credential.NewCipher(base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")))
	encrypted, _ := first.Encrypt("sk-secret")
	db.Create(&models.User{ID: "encrypted-user", Email: "encrypted@example.com", Password: "hash", OpenAIKeyCiphertext: encrypted})
	wrong, _ := credential.NewCipher(base64.StdEncoding.EncodeToString([]byte("abcdef0123456789abcdef0123456789")))
	if err := migrateCloudCredentials(db, wrong); err == nil {
		t.Fatal("wrong credential key must be rejected")
	}
}
