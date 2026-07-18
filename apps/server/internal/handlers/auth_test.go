package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAuthTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+uuid.NewString()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.StyleProfile{}, &models.LegalAcceptance{}, &models.InstanceOwner{}); err != nil {
		t.Fatal(err)
	}
	config.DB = db
	config.AppConfig.JWTSecret = "test-secret-with-enough-entropy"
	config.AppConfig.RegistrationMode = "first-user"
	config.AppConfig.CredentialEncryptionKey = base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	loginIPLimiter = middleware.NewRateLimiter(5, 5*time.Minute)
	loginEmailLimiter = middleware.NewRateLimiter(5, 5*time.Minute)
	registerIPLimiter = middleware.NewRateLimiter(5, time.Hour)
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
	w := authRequest(http.MethodPost, "/auth/register", map[string]any{"email": "new@example.com", "password": "123456789012", "accepted": true, "termsVersion": "old", "privacyVersion": CurrentPrivacyVersion}, Register)
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
	w := authRequest(http.MethodPost, "/auth/register", map[string]any{"email": "new@example.com", "password": "123456789012", "accepted": true, "termsVersion": CurrentTermsVersion, "privacyVersion": CurrentPrivacyVersion}, Register)
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

func TestFirstUserRegistrationLocksInstance(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)
	status := authRequest(http.MethodGet, "/auth/registration-status", nil, RegistrationStatus)
	if status.Code != http.StatusOK || !bytes.Contains(status.Body.Bytes(), []byte(`"allowed":true`)) {
		t.Fatalf("expected empty instance to allow registration: %d %s", status.Code, status.Body.String())
	}
	first := authRequest(http.MethodPost, "/auth/register", map[string]any{"email": "owner@example.com", "password": "123456789012", "accepted": true, "termsVersion": CurrentTermsVersion, "privacyVersion": CurrentPrivacyVersion}, Register)
	if first.Code != http.StatusCreated {
		t.Fatalf("first registration failed: %d %s", first.Code, first.Body.String())
	}
	second := authRequest(http.MethodPost, "/auth/register", map[string]any{"email": "other@example.com", "password": "123456789012", "accepted": true, "termsVersion": CurrentTermsVersion, "privacyVersion": CurrentPrivacyVersion}, Register)
	if second.Code != http.StatusForbidden {
		t.Fatalf("expected registration to lock after owner creation: %d %s", second.Code, second.Body.String())
	}
	var owner models.InstanceOwner
	if err := config.DB.First(&owner, "id = ?", "owner").Error; err != nil || owner.UserID == "" {
		t.Fatalf("owner claim was not persisted: %+v %v", owner, err)
	}
}

func TestConcurrentFirstUserRegistrationCreatesOneOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)
	registerIPLimiter = middleware.NewRateLimiter(20, time.Hour)
	codes := make(chan int, 2)
	var wg sync.WaitGroup
	for _, email := range []string{"first@example.com", "second@example.com"} {
		wg.Add(1)
		go func(email string) {
			defer wg.Done()
			w := authRequest(http.MethodPost, "/auth/register", map[string]any{"email": email, "password": "123456789012", "accepted": true, "termsVersion": CurrentTermsVersion, "privacyVersion": CurrentPrivacyVersion}, Register)
			codes <- w.Code
		}(email)
	}
	wg.Wait()
	close(codes)
	created, rejected := 0, 0
	for code := range codes {
		if code == http.StatusCreated {
			created++
		} else if code == http.StatusForbidden {
			rejected++
		}
	}
	if created != 1 || rejected != 1 {
		t.Fatalf("expected one owner and one rejection, got created=%d rejected=%d", created, rejected)
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

func TestCloudKeyIsEncryptedAndNeverReturned(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)
	user := models.User{ID: "user-key", Email: "key@example.com", Password: "hash"}
	config.DB.Create(&user)
	w := creatorRequest(http.MethodPut, "/auth/me/llm-config", user.ID, map[string]any{"llmProvider": "openai", "openAiBaseUrl": "https://example.com/v1", "openAiModel": "model", "openAiKey": "sk-top-secret", "cloudAiConsent": true}, UpdateLLMConfig)
	if w.Code != http.StatusOK {
		t.Fatalf("save key: %d %s", w.Code, w.Body.String())
	}
	if bytes.Contains(w.Body.Bytes(), []byte("sk-top-secret")) || bytes.Contains(w.Body.Bytes(), []byte(`"openAiKey"`)) {
		t.Fatalf("response leaked key: %s", w.Body.String())
	}
	config.DB.First(&user, "id = ?", user.ID)
	if user.OpenAIKey != "" || user.OpenAIKeyCiphertext == "" || user.OpenAIKeyCiphertext == "sk-top-secret" {
		t.Fatalf("key was not encrypted at rest: %+v", user)
	}
}

func TestLoginRateLimitReturnsRetryAfter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAuthTestDB(t)
	loginIPLimiter = middleware.NewRateLimiter(5, 5*time.Minute)
	loginEmailLimiter = middleware.NewRateLimiter(5, 5*time.Minute)
	for attempt := 0; attempt < 5; attempt++ {
		w := authRequest(http.MethodPost, "/auth/login", map[string]any{"email": "missing@example.com", "password": "wrong"}, Login)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", attempt+1, w.Code)
		}
	}
	blocked := authRequest(http.MethodPost, "/auth/login", map[string]any{"email": "missing@example.com", "password": "wrong"}, Login)
	if blocked.Code != http.StatusTooManyRequests || blocked.Header().Get("Retry-After") == "" {
		t.Fatalf("expected rate limit with Retry-After, got %d %v", blocked.Code, blocked.Header())
	}
}

func TestSecureCookieOnlyTrustsConfiguredProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config.AppConfig.CookieSecure = "auto"
	config.AppConfig.TrustedProxies = "10.0.0.0/8"
	req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.RemoteAddr = "203.0.113.10:1234"
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	setTokenCookie(c, "token")
	if strings.Contains(w.Header().Get("Set-Cookie"), "Secure") {
		t.Fatal("untrusted proxy must not enable secure-cookie inference")
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.RemoteAddr = "10.1.2.3:1234"
	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = req
	setTokenCookie(c, "token")
	if !strings.Contains(w.Header().Get("Set-Cookie"), "Secure") {
		t.Fatal("trusted HTTPS proxy must enable Secure cookie")
	}
}
