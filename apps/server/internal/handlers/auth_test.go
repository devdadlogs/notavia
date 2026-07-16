package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAuthTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.StyleProfile{}, &models.LegalAcceptance{}); err != nil {
		t.Fatal(err)
	}
	config.DB, config.AppConfig.JWTSecret = db, "test-secret-with-enough-entropy"
}

func authRequest(method, path string, body any, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	handler(c)
	return w
}

func TestRegisterRequiresCurrentLegalVersions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)
	w := authRequest(http.MethodPost, "/auth/register", map[string]any{"email": "new@example.com", "password": "123456", "accepted": true, "termsVersion": "old", "privacyVersion": CurrentPrivacyVersion}, Register)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected outdated terms to be rejected, got %d %s", w.Code, w.Body.String())
	}
	var count int64
	config.DB.Model(&models.User{}).Count(&count)
	if count != 0 {
		t.Fatal("rejected registration must not create a user")
	}
}

func TestNewUserStartsWithoutAnotherCreatorsProfile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)
	w := authRequest(http.MethodPost, "/auth/register", map[string]any{"email": "new@example.com", "password": "123456", "accepted": true, "termsVersion": CurrentTermsVersion, "privacyVersion": CurrentPrivacyVersion}, Register)
	if w.Code != http.StatusCreated {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	var user models.User
	config.DB.First(&user, "email = ?", "new@example.com")
	if user.OnboardingCompletedAt != nil {
		t.Fatal("new user must enter onboarding")
	}
	var profiles, acceptances int64
	config.DB.Model(&models.StyleProfile{}).Where("user_id = ?", user.ID).Count(&profiles)
	config.DB.Model(&models.LegalAcceptance{}).Where("user_id = ?", user.ID).Count(&acceptances)
	if profiles != 0 || acceptances != 1 {
		t.Fatalf("unexpected initial records: profiles=%d acceptances=%d", profiles, acceptances)
	}
}

func TestCloudModelRequiresExplicitConsent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)
	user := models.User{ID: "user-a", Email: "a@example.com", Password: "hash"}
	config.DB.Create(&user)
	w := creatorRequest(http.MethodPut, "/auth/me/llm-config", user.ID, map[string]any{"llmProvider": "openai", "openAiBaseUrl": "https://example.com/v1", "openAiModel": "model", "cloudAiConsent": false}, UpdateLLMConfig)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected cloud model without consent to fail, got %d %s", w.Code, w.Body.String())
	}
	config.DB.First(&user, "id = ?", user.ID)
	if user.LLMProvider == "openai" {
		t.Fatal("rejected cloud configuration must not be saved")
	}
}
