package middleware

import (
	"sync"
	"time"
)

type rateEntry struct {
	count int
	reset time.Time
}

type RateLimiter struct {
	mu      sync.Mutex
	entries map[string]rateEntry
	limit   int
	window  time.Duration
}

const maxRateLimitEntries = 10000

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{entries: make(map[string]rateEntry), limit: limit, window: window}
}

func (l *RateLimiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.entries) >= maxRateLimitEntries {
		for candidate, existing := range l.entries {
			if !now.Before(existing.reset) {
				delete(l.entries, candidate)
			}
		}
		if _, exists := l.entries[key]; !exists && len(l.entries) >= maxRateLimitEntries {
			return false, l.window
		}
	}
	entry := l.entries[key]
	if entry.reset.IsZero() || !now.Before(entry.reset) {
		l.entries[key] = rateEntry{count: 1, reset: now.Add(l.window)}
		return true, 0
	}
	if entry.count >= l.limit {
		return false, time.Until(entry.reset)
	}
	entry.count++
	l.entries[key] = entry
	return true, 0
}
