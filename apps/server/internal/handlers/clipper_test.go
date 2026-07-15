package handlers

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return fn(req) }

type errorReadCloser struct{ err error }

func (r errorReadCloser) Read([]byte) (int, error) { return 0, r.err }
func (r errorReadCloser) Close() error             { return nil }

func TestFetchClipperHTMLRetriesWhenResponseBodyTimesOut(t *testing.T) {
	attempts := 0
	client := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		attempts++
		body := io.ReadCloser(io.NopCloser(strings.NewReader(`<html><title>成功</title></html>`)))
		if attempts == 1 {
			body = errorReadCloser{err: context.DeadlineExceeded}
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: body}, nil
	})}

	body, err := fetchClipperHTML(context.Background(), client, "https://mp.weixin.qq.com/s/example")
	if err != nil {
		t.Fatal(err)
	}
	if attempts != 2 || !strings.Contains(string(body), "<title>成功</title>") {
		t.Fatalf("expected a successful second attempt, attempts=%d body=%s", attempts, body)
	}
}

func TestPreserveArticleAssetsLocalizesImagesAndKeepsStructure(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`<article>
<h2>标题</h2><p><strong>重点</strong></p>
<picture><source srcset="/large.webp"><img data-src="../images/photo.jpg" alt="说明" onerror="alert(1)"></picture>
<ul><li>第一项</li></ul><a href="/detail">详情</a><script>alert(1)</script>
</article>`))
	if err != nil {
		t.Fatal(err)
	}
	var downloaded string
	preserveArticleAssets(doc.Find("article"), "https://example.com/posts/one", func(source string) (string, error) {
		downloaded = source
		return "/uploads/local.jpg", nil
	})

	html, _ := doc.Find("article").Html()
	if downloaded != "https://example.com/images/photo.jpg" {
		t.Fatalf("unexpected resolved image URL: %s", downloaded)
	}
	for _, expected := range []string{"<h2>标题</h2>", "<strong>重点</strong>", "<ul><li>第一项</li></ul>", `src="/uploads/local.jpg"`, `href="https://example.com/detail"`} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected preserved HTML %q in %s", expected, html)
		}
	}
	for _, unsafe := range []string{"<script", "onerror=", "<source"} {
		if strings.Contains(html, unsafe) {
			t.Fatalf("unsafe or overriding markup remained: %s", html)
		}
	}
}

func TestUnsafeClipperIPBlocksPrivateNetworks(t *testing.T) {
	for _, raw := range []string{"127.0.0.1", "10.0.0.2", "192.168.1.2", "169.254.169.254", "::1"} {
		if !unsafeClipperIP(net.ParseIP(raw)) {
			t.Fatalf("expected %s to be blocked", raw)
		}
	}
	if unsafeClipperIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("public address must remain available")
	}
}

func TestPreserveArticleAssetsCapsDownloadsWithoutLeavingRemoteImages(t *testing.T) {
	markup := "<main>" + strings.Repeat(`<img src="/photo.jpg">`, maxClippedImages+1) + "</main>"
	doc, _ := goquery.NewDocumentFromReader(strings.NewReader(markup))
	downloads := 0
	preserveArticleAssets(doc.Find("main"), "https://example.com/article", func(string) (string, error) {
		downloads++
		return "/uploads/local.jpg", nil
	})
	if downloads != maxClippedImages {
		t.Fatalf("expected %d downloads, got %d", maxClippedImages, downloads)
	}
	doc.Find("img").Each(func(_ int, image *goquery.Selection) {
		src, _ := image.Attr("src")
		if strings.HasPrefix(src, "http") {
			t.Fatalf("remote tracking image remained: %s", src)
		}
	})
}

func TestClippedImageDownloaderStoresOwnedLocalFile(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.UploadedFile{}); err != nil {
		t.Fatal(err)
	}
	config.DB = db
	config.AppConfig.UploadDir = t.TempDir()

	client := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"image/png"}},
			Body:       io.NopCloser(strings.NewReader("fake-png")),
		}, nil
	})}

	var assets []downloadedAsset
	localURL, err := clippedImageDownloader(context.Background(), "user-a", client, &assets)("https://example.com/photo.png")
	if err != nil {
		t.Fatal(err)
	}
	if len(assets) != 1 || !strings.HasPrefix(localURL, "/uploads/") {
		t.Fatalf("asset was not registered: url=%q assets=%v", localURL, assets)
	}
	if _, err := os.Stat(filepath.Join(config.AppConfig.UploadDir, assets[0].filename)); err != nil {
		t.Fatalf("downloaded file missing: %v", err)
	}
	var count int64
	db.Model(&models.UploadedFile{}).Where("user_id = ? AND filename = ?", "user-a", assets[0].filename).Count(&count)
	if count != 1 {
		t.Fatalf("expected owned upload record, got %d", count)
	}
}

func TestPreserveArticleAssetsDoesNotLeaveRemoteTrackingImage(t *testing.T) {
	doc, _ := goquery.NewDocumentFromReader(strings.NewReader(`<main><img src="/fallback.png"></main>`))
	preserveArticleAssets(doc.Find("main"), "https://example.com/article", func(string) (string, error) {
		return "", errors.New("blocked")
	})
	html, _ := doc.Find("main").Html()
	if doc.Find("img").Length() != 0 || !strings.Contains(html, `href="https://example.com/fallback.png"`) {
		t.Fatalf("expected a non-fetching original-image link, got %s", html)
	}
}

func TestPreserveArticleAssetsKeepsSafeVideoAndVisualFormatting(t *testing.T) {
	doc, _ := goquery.NewDocumentFromReader(strings.NewReader(`<main>
<p style="color: #8b1a12; font-size: 24px; line-height: 1.8; position: fixed; background-image: url(https://tracker.test/a.png)">重点内容</p>
<video autoplay poster="/poster.jpg"><source src="/interview.mp4" type="video/mp4"></video>
<iframe src="https://tv.cctv.com/player.html?id=1"></iframe>
</main>`))
	preserveArticleAssets(doc.Find("main"), "https://example.com/article", func(source string) (string, error) {
		if strings.HasSuffix(source, "/poster.jpg") {
			return "/uploads/poster.jpg", nil
		}
		return "", errors.New("unexpected image")
	})
	html, _ := doc.Find("main").Html()
	for _, expected := range []string{`color: #8b1a12`, `font-size: 24px`, `line-height: 1.8`, `src="https://example.com/interview.mp4"`, `poster="/uploads/poster.jpg"`, `sandbox=`, `https://tv.cctv.com/player.html?id=1`} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected %q in preserved HTML: %s", expected, html)
		}
	}
	for _, unsafe := range []string{"autoplay", "position: fixed", "background-image", "tracker.test"} {
		if strings.Contains(html, unsafe) {
			t.Fatalf("unsafe formatting remained: %s", html)
		}
	}
}

func TestPreserveArticleAssetsConvertsWeChatVideoCard(t *testing.T) {
	doc, _ := goquery.NewDocumentFromReader(strings.NewReader(`<main>
<p style="margin: 0; line-height: 1.75em"><span><br></span></p>
<section class="channels_iframe_wrp">
  <mp-common-videosnap data-type="video" data-url="https://findermp.video.qq.com/video.mp4?token=abc&amp;idx=1" data-width="1080" data-height="1440" data-desc="人物采访"></mp-common-videosnap>
</section>
</main>`))
	preserveArticleAssets(doc.Find("main"), "https://mp.weixin.qq.com/s/example", func(string) (string, error) {
		return "", errors.New("no image")
	})

	html, _ := doc.Find("main").Html()
	for _, expected := range []string{`<video`, `controls="controls"`, `src="https://findermp.video.qq.com/video.mp4?token=abc&amp;idx=1"`, `width="1080"`, `height="1440"`, `class="clipper-spacer"`} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected %q in converted WeChat content: %s", expected, html)
		}
	}
	if strings.Contains(html, "mp-common-videosnap") {
		t.Fatalf("WeChat-only video element remained: %s", html)
	}
}
