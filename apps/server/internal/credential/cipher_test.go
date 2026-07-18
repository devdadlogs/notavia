package credential

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestCipherRoundTripAndRandomNonce(t *testing.T) {
	key := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	cipher, err := NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	first, err := cipher.Encrypt("sk-secret-value")
	if err != nil {
		t.Fatal(err)
	}
	second, _ := cipher.Encrypt("sk-secret-value")
	if first == second {
		t.Fatal("ciphertexts must use independent nonces")
	}
	plain, err := cipher.Decrypt(first)
	if err != nil || plain != "sk-secret-value" {
		t.Fatalf("round trip failed: %q %v", plain, err)
	}
	if strings.Contains(first, "sk-secret-value") {
		t.Fatal("ciphertext leaked plaintext")
	}
}

func TestCipherRejectsInvalidKey(t *testing.T) {
	if _, err := NewCipher("too-short"); err == nil {
		t.Fatal("invalid key must be rejected")
	}
}
