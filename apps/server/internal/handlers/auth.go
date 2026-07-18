package handlers

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/credential"
	"github.com/notavia/server/internal/middleware"
	"github.com/notavia/server/internal/models"
	"gorm.io/gorm"
)

const (
	CurrentTermsVersion        = "2026-07-16"
	CurrentPrivacyVersion      = "2026-07-16"
	CurrentCloudConsentVersion = "2026-07-16"
)

var loginIPLimiter = middleware.NewRateLimiter(5, 5*time.Minute)
var loginEmailLimiter = middleware.NewRateLimiter(5, 5*time.Minute)
var registerIPLimiter = middleware.NewRateLimiter(5, time.Hour)
var registrationMu sync.Mutex

type RegisterInput struct {
	Email          string `json:"email" binding:"required,email"`
	Password       string `json:"password" binding:"required,min=12"`
	Name           string `json:"name"`
	Accepted       bool   `json:"accepted"`
	TermsVersion   string `json:"termsVersion"`
	PrivacyVersion string `json:"privacyVersion"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func Register(c *gin.Context) {
	if config.AppConfig.RegistrationMode == "first-user" {
		registrationMu.Lock()
		defer registrationMu.Unlock()
	}
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !allowRateLimit(c, registerIPLimiter, c.ClientIP()) {
		return
	}
	if !input.Accepted || input.TermsVersion != CurrentTermsVersion || input.PrivacyVersion != CurrentPrivacyVersion {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请阅读并同意当前版本的用户协议和隐私政策"})
		return
	}
	if !registrationAllowed() {
		c.JSON(http.StatusForbidden, gin.H{"error": "当前实例已关闭注册"})
		return
	}

	// Check if email already exists
	var existing models.User
	if err := config.DB.Where("email = ?", input.Email).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	// Hash password
	hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := models.User{
		ID:       uuid.New().String(),
		Email:    input.Email,
		Password: string(hashed),
		Name:     input.Name,
	}

	now := time.Now()
	user.TermsVersion, user.PrivacyVersion, user.LegalAcceptedAt = input.TermsVersion, input.PrivacyVersion, &now
	acceptance := models.LegalAcceptance{ID: uuid.NewString(), UserID: user.ID, TermsVersion: input.TermsVersion, PrivacyVersion: input.PrivacyVersion, AcceptedAt: now}
	if err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		if config.AppConfig.RegistrationMode == "first-user" {
			if err := tx.Create(&models.InstanceOwner{ID: "owner", UserID: user.ID}).Error; err != nil {
				return err
			}
		}
		return tx.Create(&acceptance).Error
	}); err != nil {
		if config.AppConfig.RegistrationMode == "first-user" && !registrationAllowed() {
			c.JSON(http.StatusForbidden, gin.H{"error": "当前实例已完成首位用户注册"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}
	if config.AppConfig.RegistrationMode == "open" {
		config.DB.Exec("INSERT INTO instance_owners (id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", "owner", user.ID, now)
	}

	// Generate JWT
	token := generateToken(user)
	setTokenCookie(c, token)

	c.JSON(http.StatusCreated, gin.H{
		"user": sanitizeUser(user),
	})
}

func registrationAllowed() bool {
	switch config.AppConfig.RegistrationMode {
	case "open":
		return true
	case "closed":
		return false
	default:
		var count int64
		config.DB.Model(&models.InstanceOwner{}).Where("id = ?", "owner").Count(&count)
		return count == 0
	}
}

func RegistrationStatus(c *gin.Context) {
	allowed := registrationAllowed()
	reason := "open"
	if !allowed {
		reason = "closed"
	} else if config.AppConfig.RegistrationMode == "first-user" {
		reason = "first-user"
	}
	c.JSON(http.StatusOK, gin.H{"allowed": allowed, "reason": reason})
}

type onboardingInput struct {
	Name          string   `json:"name"`
	Biography     string   `json:"biography"`
	Positioning   string   `json:"positioning"`
	Rules         []string `json:"rules"`
	BannedPhrases []string `json:"bannedPhrases"`
}

func CompleteOnboarding(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input onboardingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "引导信息格式不正确"})
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Biography = strings.TrimSpace(input.Biography)
	input.Positioning = strings.TrimSpace(input.Positioning)
	rulesJSON, _ := json.Marshal(cleanStrings(input.Rules))
	bannedJSON, _ := json.Marshal(cleanStrings(input.BannedPhrases))
	now := time.Now()
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{"name": input.Name, "onboarding_completed_at": now}
		if err := tx.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			return err
		}
		var profile models.StyleProfile
		if err := tx.Where("user_id = ?", userID).First(&profile).Error; err != nil {
			profile = models.StyleProfile{ID: uuid.NewString(), UserID: userID}
		}
		profile.Biography, profile.Positioning = input.Biography, input.Positioning
		profile.RulesJSON, profile.BannedPhrasesJSON = string(rulesJSON), string(bannedJSON)
		return tx.Save(&profile).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存引导信息失败"})
		return
	}
	var user models.User
	config.DB.First(&user, "id = ?", userID)
	c.JSON(http.StatusOK, gin.H{"user": sanitizeUser(user)})
}

func cleanStrings(values []string) []string {
	cleaned := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			cleaned = append(cleaned, value)
		}
	}
	return cleaned
}

func Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !allowRateLimit(c, loginIPLimiter, c.ClientIP()) || !allowRateLimit(c, loginEmailLimiter, strings.ToLower(input.Email)) {
		return
	}

	var user models.User
	if err := config.DB.Where("email = ?", input.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	token := generateToken(user)
	setTokenCookie(c, token)

	c.JSON(http.StatusOK, gin.H{
		"user": sanitizeUser(user),
	})
}

func Logout(c *gin.Context) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("token", "", -1, "/", "", requestIsHTTPS(c), true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func GetMe(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var user models.User
	if err := config.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": sanitizeUser(user)})
}

type UpdateLLMConfigInput struct {
	LLMProvider    string  `json:"llmProvider"`
	OpenAIBaseURL  string  `json:"openAiBaseUrl"`
	OpenAIKey      *string `json:"openAiKey"`
	ClearOpenAIKey bool    `json:"clearOpenAiKey"`
	OpenAIModel    string  `json:"openAiModel"`
	CloudAIConsent bool    `json:"cloudAiConsent"`
}

func UpdateLLMConfig(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input UpdateLLMConfigInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.LLMProvider == "openai" && !input.CloudAIConsent {
		c.JSON(http.StatusBadRequest, gin.H{"error": "启用云模型前，请确认所选内容会发送到第三方模型服务商"})
		return
	}

	updates := map[string]any{"llm_provider": input.LLMProvider, "open_ai_base_url": input.OpenAIBaseURL, "open_ai_model": input.OpenAIModel}
	if input.ClearOpenAIKey {
		updates["open_ai_key_ciphertext"], updates["open_ai_key"], updates["open_ai_key_hint"] = "", "", ""
	} else if input.OpenAIKey != nil && strings.TrimSpace(*input.OpenAIKey) != "" {
		cipher, err := credential.NewCipher(config.AppConfig.CredentialEncryptionKey)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "云模型密钥加密尚未配置"})
			return
		}
		encrypted, err := cipher.Encrypt(strings.TrimSpace(*input.OpenAIKey))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "加密云模型密钥失败"})
			return
		}
		updates["open_ai_key_ciphertext"], updates["open_ai_key"], updates["open_ai_key_hint"] = encrypted, "", keyHint(*input.OpenAIKey)
	}
	if input.LLMProvider == "openai" {
		now := time.Now()
		updates["cloud_ai_consent_at"], updates["cloud_ai_consent_version"] = now, CurrentCloudConsentVersion
	}
	err := config.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update LLM config"})
		return
	}

	// Double check by reading it back to ensure it was saved
	var checkUser models.User
	config.DB.Where("id = ?", userID).First(&checkUser)

	// Update frontend user store
	c.JSON(http.StatusOK, gin.H{
		"message": "LLM config updated successfully",
		"user":    sanitizeUser(checkUser),
	})
}

func DeleteAccount(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var input struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入当前密码"})
		return
	}
	var user models.User
	if err := config.DB.First(&user, "id = ?", userID).Error; err != nil || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码不正确"})
		return
	}
	var removable []string
	config.DB.Model(&models.UploadedFile{}).Where("user_id = ?", userID).Pluck("filename", &removable)
	var audioURLs []string
	config.DB.Model(&models.Note{}).Where("user_id = ? AND audio_url <> ''", userID).Pluck("audio_url", &audioURLs)
	var ownerCount int64
	config.DB.Model(&models.InstanceOwner{}).Where("id = ? AND user_id = ?", "owner", userID).Count(&ownerCount)
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var workIDs, topicIDs, noteIDs []string
		tx.Model(&models.Work{}).Where("user_id = ?", userID).Pluck("id", &workIDs)
		tx.Model(&models.Topic{}).Where("user_id = ?", userID).Pluck("id", &topicIDs)
		tx.Model(&models.Note{}).Where("user_id = ?", userID).Pluck("id", &noteIDs)
		if len(workIDs) > 0 {
			tx.Where("work_id IN ?", workIDs).Delete(&models.Citation{})
		}
		tx.Where("user_id = ?", userID).Delete(&models.Publication{})
		tx.Where("user_id = ?", userID).Delete(&models.Revision{})
		tx.Where("user_id = ?", userID).Delete(&models.Work{})
		if len(topicIDs) > 0 {
			tx.Where("topic_id IN ?", topicIDs).Delete(&models.TopicMaterial{})
		}
		if len(noteIDs) > 0 {
			tx.Where("note_id IN ?", noteIDs).Delete(&models.NoteTag{})
		}
		tx.Where("user_id = ?", userID).Delete(&models.MaterialInsight{})
		tx.Where("user_id = ?", userID).Delete(&models.Note{})
		tx.Where("user_id = ?", userID).Delete(&models.Tag{})
		tx.Where("user_id = ?", userID).Delete(&models.Notebook{})
		tx.Where("user_id = ?", userID).Delete(&models.Topic{})
		tx.Where("user_id = ?", userID).Delete(&models.StyleProfile{})
		tx.Where("user_id = ?", userID).Delete(&models.UploadedFile{})
		tx.Where("user_id = ?", userID).Delete(&models.AiUsageLog{})
		tx.Where("user_id = ?", userID).Delete(&models.LegalAcceptance{})
		tx.Where("user_id = ?", userID).Delete(&models.InstanceOwner{})
		if err := tx.Delete(&user).Error; err != nil {
			return err
		}
		if ownerCount == 1 {
			var successor models.User
			if err := tx.Order("created_at ASC").First(&successor).Error; err == nil {
				return tx.Create(&models.InstanceOwner{ID: "owner", UserID: successor.ID}).Error
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "注销账号失败"})
		return
	}
	removeUploadedAssets(userID, removable)
	for _, audioURL := range audioURLs {
		_ = os.Remove(filepath.Join(config.AppConfig.UploadDir, "audio", filepath.Base(audioURL)))
	}
	_ = getQdrantService().DeleteAllNotesByUserID(userID)
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("token", "", -1, "/", "", requestIsHTTPS(c), true)
	c.Status(http.StatusNoContent)
}

// --- Helpers ---

func generateToken(user models.User) string {
	claims := middleware.JWTClaims{
		UserID: user.ID,
		Email:  user.Email,
		Name:   user.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
	}
	token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.AppConfig.JWTSecret))
	return token
}

func setTokenCookie(c *gin.Context, token string) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("token", token, 7*24*3600, "/", "", requestIsHTTPS(c), true)
}

func allowRateLimit(c *gin.Context, limiter *middleware.RateLimiter, key string) bool {
	allowed, retry := limiter.Allow(key)
	if allowed {
		return true
	}
	seconds := int(retry.Seconds()) + 1
	c.Header("Retry-After", strconv.Itoa(seconds))
	c.JSON(http.StatusTooManyRequests, gin.H{"error": "尝试次数过多，请稍后重试"})
	return false
}

func requestIsHTTPS(c *gin.Context) bool {
	if config.AppConfig.CookieSecure == "true" || c.Request.TLS != nil {
		return true
	}
	if config.AppConfig.CookieSecure != "auto" || !strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		return false
	}
	host, _, err := net.SplitHostPort(c.Request.RemoteAddr)
	if err != nil {
		host = c.Request.RemoteAddr
	}
	ip := net.ParseIP(host)
	for _, raw := range strings.Split(config.AppConfig.TrustedProxies, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if proxyIP := net.ParseIP(raw); proxyIP != nil && proxyIP.Equal(ip) {
			return true
		}
		if _, network, err := net.ParseCIDR(raw); err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

func sanitizeUser(user models.User) gin.H {
	var ownerCount int64
	config.DB.Model(&models.InstanceOwner{}).Where("id = ? AND user_id = ?", "owner", user.ID).Count(&ownerCount)
	return gin.H{
		"id":                    user.ID,
		"email":                 user.Email,
		"name":                  user.Name,
		"avatarUrl":             user.AvatarURL,
		"plan":                  user.Plan,
		"createdAt":             user.CreatedAt,
		"isAdmin":               ownerCount == 1,
		"llmProvider":           user.LLMProvider,
		"openAiBaseUrl":         user.OpenAIBaseURL,
		"openAiKeyConfigured":   user.OpenAIKeyCiphertext != "" || user.OpenAIKey != "",
		"openAiKeyHint":         credentialHint(user),
		"openAiModel":           user.OpenAIModel,
		"termsVersion":          user.TermsVersion,
		"privacyVersion":        user.PrivacyVersion,
		"legalAcceptedAt":       user.LegalAcceptedAt,
		"onboardingCompletedAt": user.OnboardingCompletedAt,
		"cloudAiConsentVersion": user.CloudAIConsentVersion,
		"cloudAiConsentAt":      user.CloudAIConsentAt,
	}
}

func credentialHint(user models.User) string {
	if user.OpenAIKeyCiphertext == "" && user.OpenAIKey == "" {
		return ""
	}
	return "••••" + user.OpenAIKeyHint
}

func keyHint(key string) string {
	key = strings.TrimSpace(key)
	if len(key) <= 4 {
		return ""
	}
	return key[len(key)-4:]
}
