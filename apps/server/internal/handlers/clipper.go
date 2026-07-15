package handlers

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/google/uuid"
	"github.com/notavia/server/internal/config"
	"github.com/notavia/server/internal/models"
)

const maxClippedImageSize = 15 << 20 // 15 MB per image
const maxClippedImages = 50
const maxClippedImagesTotalSize = 75 << 20 // 75 MB per article
const maxClippedHTMLSize = 10 << 20
const clipperFetchAttempts = 2
const clipperFetchAttemptTimeout = 35 * time.Second

type imageDownloader func(string) (string, error)

type downloadedAsset struct {
	id       string
	filename string
}

var uploadedAssetPattern = regexp.MustCompile(`/uploads/([A-Za-z0-9._-]+)`)
var safeMediaDimension = regexp.MustCompile(`^[1-9][0-9]{0,4}$`)

func clipperFetchTimedOut(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var networkErr net.Error
	return errors.As(err, &networkErr) && networkErr.Timeout()
}

func fetchClipperHTML(ctx context.Context, client *http.Client, rawURL string) ([]byte, error) {
	var lastErr error
	for attempt := 1; attempt <= clipperFetchAttempts; attempt++ {
		attemptCtx, cancel := context.WithTimeout(ctx, clipperFetchAttemptTimeout)
		req, err := http.NewRequestWithContext(attemptCtx, http.MethodGet, rawURL, nil)
		if err != nil {
			cancel()
			return nil, err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.7")

		res, requestErr := client.Do(req)
		if requestErr == nil {
			if res.StatusCode != http.StatusOK {
				_ = res.Body.Close()
				cancel()
				lastErr = fmt.Errorf("网页返回状态码 %d", res.StatusCode)
				if res.StatusCode != http.StatusTooManyRequests && res.StatusCode < http.StatusInternalServerError {
					return nil, lastErr
				}
				continue
			}

			body, readErr := io.ReadAll(io.LimitReader(res.Body, maxClippedHTMLSize+1))
			_ = res.Body.Close()
			attemptErr := attemptCtx.Err()
			cancel()
			if readErr == nil {
				if len(body) > maxClippedHTMLSize {
					return nil, fmt.Errorf("网页正文超过 %d MB 限制", maxClippedHTMLSize>>20)
				}
				return body, nil
			}
			if attemptErr != nil {
				lastErr = fmt.Errorf("读取网页正文超时: %w", attemptErr)
			} else {
				lastErr = fmt.Errorf("读取网页正文失败: %w", readErr)
			}
		} else {
			attemptErr := attemptCtx.Err()
			cancel()
			if attemptErr != nil {
				lastErr = fmt.Errorf("连接网页超时: %w", attemptErr)
			} else {
				lastErr = fmt.Errorf("连接网页失败: %w", requestErr)
			}
		}

		if ctx.Err() != nil {
			return nil, fmt.Errorf("抓取网页已取消: %w", ctx.Err())
		}
	}
	return nil, lastErr
}

func preserveArticleAssets(content *goquery.Selection, pageURL string, download imageDownloader) {
	base, err := url.Parse(pageURL)
	if err != nil {
		return
	}

	imageCount := 0
	content.Find("img").Each(func(_ int, image *goquery.Selection) {
		imageCount++
		raw := imageSource(image)
		absolute := resolveWebURL(base, raw)
		if absolute == "" {
			return
		}

		if imageCount > maxClippedImages {
			replaceUnavailableImage(image, absolute)
			return
		}
		local, err := download(absolute)
		if err != nil {
			replaceUnavailableImage(image, absolute)
			return
		}
		image.SetAttr("src", local)
		for _, attr := range []string{"srcset", "data-src", "data-original", "data-lazy-src", "data-srcset"} {
			image.RemoveAttr(attr)
		}
	})

	// Once img.src is normalized, picture sources could override it with remote URLs.
	content.Find("picture source").Remove()
	normalizeWeChatVideoCards(content, base)
	normalizeMedia(content, base, download)
	markClippedSpacers(content)
	normalizeLinks(content, base)
	sanitizeClippedHTML(content)
}

func normalizeWeChatVideoCards(content *goquery.Selection, base *url.URL) {
	content.Find("mp-common-videosnap[data-url]").Each(func(_ int, card *goquery.Selection) {
		raw, _ := card.Attr("data-url")
		videoURL := resolveWebURL(base, raw)
		if videoURL == "" {
			card.Remove()
			return
		}

		attributes := []string{
			`class="wechat-video"`,
			`controls="controls"`,
			`preload="metadata"`,
			`playsinline="playsinline"`,
			`src="` + html.EscapeString(videoURL) + `"`,
		}
		for _, name := range []string{"width", "height"} {
			if value, ok := card.Attr("data-" + name); ok && safeMediaDimension.MatchString(value) {
				attributes = append(attributes, name+`="`+value+`"`)
			}
		}
		fallback := `<a href="` + html.EscapeString(videoURL) + `" target="_blank" rel="noreferrer">打开原视频</a>`
		card.ReplaceWithHtml("<video " + strings.Join(attributes, " ") + ">" + fallback + "</video>")
	})
}

func markClippedSpacers(content *goquery.Selection) {
	content.Find("p").Each(func(_ int, paragraph *goquery.Selection) {
		if strings.TrimSpace(paragraph.Text()) != "" || paragraph.Find("br").Length() == 0 ||
			paragraph.Find("img,video,audio,iframe,table,hr").Length() > 0 {
			return
		}
		classes, _ := paragraph.Attr("class")
		paragraph.SetAttr("class", strings.TrimSpace(classes+" clipper-spacer"))
	})
}

func normalizeMedia(content *goquery.Selection, base *url.URL, download imageDownloader) {
	content.Find("video,audio").Each(func(_ int, media *goquery.Selection) {
		raw, _ := media.Attr("src")
		if strings.TrimSpace(raw) == "" {
			raw, _ = media.Find("source[src]").First().Attr("src")
		}
		if absolute := resolveWebURL(base, raw); absolute != "" {
			media.SetAttr("src", absolute)
		} else {
			media.RemoveAttr("src")
		}
		media.Find("source").Remove()
		media.RemoveAttr("autoplay")
		media.RemoveAttr("loop")
		media.SetAttr("controls", "controls")
		media.SetAttr("preload", "metadata")

		if poster, ok := media.Attr("poster"); ok {
			if absolute := resolveWebURL(base, poster); absolute != "" {
				if local, err := download(absolute); err == nil {
					media.SetAttr("poster", local)
				} else {
					media.RemoveAttr("poster")
				}
			} else {
				media.RemoveAttr("poster")
			}
		}
	})

	content.Find("iframe[src]").Each(func(_ int, frame *goquery.Selection) {
		raw, _ := frame.Attr("src")
		absolute := resolveWebURL(base, raw)
		if absolute == "" {
			frame.Remove()
			return
		}
		frame.SetAttr("src", absolute)
		frame.SetAttr("sandbox", "allow-scripts allow-same-origin allow-presentation")
		frame.SetAttr("allow", "fullscreen; picture-in-picture")
		frame.SetAttr("loading", "lazy")
		frame.SetAttr("referrerpolicy", "no-referrer")
		frame.RemoveAttr("srcdoc")
	})
}

func replaceUnavailableImage(image *goquery.Selection, originalURL string) {
	label := "图片未能保存"
	if alt, ok := image.Attr("alt"); ok && strings.TrimSpace(alt) != "" {
		label += "：" + strings.TrimSpace(alt)
	}
	_ = image.ReplaceWithHtml(fmt.Sprintf(`<p>[%s] <a href="%s">查看原图</a></p>`, html.EscapeString(label), html.EscapeString(originalURL)))
}

func imageSource(image *goquery.Selection) string {
	for _, attr := range []string{"data-src", "data-original", "data-lazy-src", "src", "data-srcset", "srcset"} {
		value, ok := image.Attr(attr)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		if strings.Contains(attr, "srcset") {
			value = strings.TrimSpace(strings.Split(value, ",")[0])
			value = strings.Fields(value)[0]
		}
		if !strings.HasPrefix(strings.TrimSpace(value), "data:") {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func resolveWebURL(base *url.URL, raw string) string {
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	resolved := base.ResolveReference(parsed)
	if resolved.Scheme != "http" && resolved.Scheme != "https" {
		return ""
	}
	return resolved.String()
}

func normalizeLinks(content *goquery.Selection, base *url.URL) {
	content.Find("a[href]").Each(func(_ int, link *goquery.Selection) {
		href, _ := link.Attr("href")
		if absolute := resolveWebURL(base, href); absolute != "" {
			link.SetAttr("href", absolute)
		} else {
			link.RemoveAttr("href")
		}
	})
}

func sanitizeClippedHTML(content *goquery.Selection) {
	content.Find("script,style,noscript,object,embed,form,input,button,textarea,select,link,meta,source,track,svg").Remove()
	content.Find("*").Each(func(_ int, element *goquery.Selection) {
		for _, node := range element.Nodes {
			var remove []string
			for _, attr := range node.Attr {
				key := strings.ToLower(attr.Key)
				if strings.HasPrefix(key, "on") || key == "srcdoc" {
					remove = append(remove, attr.Key)
				}
			}
			for _, key := range remove {
				element.RemoveAttr(key)
			}
		}
		if rawStyle, ok := element.Attr("style"); ok {
			if safeStyle := sanitizeInlineStyle(rawStyle); safeStyle != "" {
				element.SetAttr("style", safeStyle)
			} else {
				element.RemoveAttr("style")
			}
		}
	})
}

var allowedInlineStyles = map[string]bool{
	"color": true, "background-color": true, "font-size": true, "font-weight": true,
	"font-style": true, "font-family": true, "line-height": true, "letter-spacing": true,
	"text-align": true, "text-decoration": true, "margin": true, "margin-top": true,
	"margin-right": true, "margin-bottom": true, "margin-left": true, "padding": true,
	"padding-top": true, "padding-right": true, "padding-bottom": true, "padding-left": true,
	"width": true, "max-width": true, "height": true, "max-height": true,
}

func sanitizeInlineStyle(raw string) string {
	var safe []string
	for _, declaration := range strings.Split(raw, ";") {
		parts := strings.SplitN(declaration, ":", 2)
		if len(parts) != 2 {
			continue
		}
		property := strings.ToLower(strings.TrimSpace(parts[0]))
		value := strings.TrimSpace(parts[1])
		lowerValue := strings.ToLower(value)
		if !allowedInlineStyles[property] || value == "" || strings.Contains(lowerValue, "url(") ||
			strings.Contains(lowerValue, "expression") || strings.Contains(lowerValue, "javascript:") ||
			strings.ContainsAny(value, "{}<>\\") {
			continue
		}
		safe = append(safe, property+": "+value)
	}
	return strings.Join(safe, "; ")
}

func clippedImageDownloader(ctx context.Context, userID string, client *http.Client, assets *[]downloadedAsset) imageDownloader {
	totalBytes := 0
	return func(sourceURL string) (string, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36")
		res, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return "", fmt.Errorf("image returned HTTP %d", res.StatusCode)
		}

		contentType := strings.ToLower(strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0]))
		if !strings.HasPrefix(contentType, "image/") || contentType == "image/svg+xml" {
			return "", fmt.Errorf("unsupported image type %q", contentType)
		}
		body, err := io.ReadAll(io.LimitReader(res.Body, maxClippedImageSize+1))
		if err != nil {
			return "", err
		}
		if len(body) == 0 || len(body) > maxClippedImageSize {
			return "", fmt.Errorf("image is empty or exceeds 15 MB")
		}
		if totalBytes+len(body) > maxClippedImagesTotalSize {
			return "", fmt.Errorf("article images exceed 75 MB")
		}
		totalBytes += len(body)

		ext := clippedImageExtension(contentType, sourceURL)
		filename := uuid.NewString() + ext
		if err := os.MkdirAll(config.AppConfig.UploadDir, 0o755); err != nil {
			return "", err
		}
		path := filepath.Join(config.AppConfig.UploadDir, filename)
		if err := os.WriteFile(path, body, 0o644); err != nil {
			return "", err
		}
		asset := downloadedAsset{id: uuid.NewString(), filename: filename}
		if err := config.DB.Create(&models.UploadedFile{ID: asset.id, UserID: userID, Filename: filename}).Error; err != nil {
			_ = os.Remove(path)
			return "", err
		}
		*assets = append(*assets, asset)
		return "/uploads/" + filename, nil
	}
}

func rollbackDownloadedAssets(assets []downloadedAsset) {
	for _, asset := range assets {
		_ = config.DB.Delete(&models.UploadedFile{}, "id = ?", asset.id).Error
		_ = os.Remove(filepath.Join(config.AppConfig.UploadDir, asset.filename))
	}
}

func removableNoteUploads(userID string, notes []models.Note) []string {
	deletingIDs := make([]string, 0, len(notes))
	candidates := map[string]struct{}{}
	for _, note := range notes {
		deletingIDs = append(deletingIDs, note.ID)
		content := note.ContentJSON + "\n" + note.ContentText + "\n" + note.SourceHTML + "\n" + note.CoverImage
		for _, match := range uploadedAssetPattern.FindAllStringSubmatch(content, -1) {
			candidates[filepath.Base(match[1])] = struct{}{}
		}
	}

	var removable []string
	for filename := range candidates {
		like := "%/uploads/" + filename + "%"
		query := config.DB.Model(&models.Note{}).Where("user_id = ?", userID)
		if len(deletingIDs) > 0 {
			query = query.Where("id NOT IN ?", deletingIDs)
		}
		var references int64
		query.Where("content_json LIKE ? OR content_text LIKE ? OR source_html LIKE ? OR cover_image LIKE ?", like, like, like, like).Count(&references)
		if references == 0 {
			removable = append(removable, filename)
		}
	}
	return removable
}

func removeUploadedAssets(userID string, filenames []string) {
	if len(filenames) == 0 {
		return
	}
	_ = config.DB.Where("user_id = ? AND filename IN ?", userID, filenames).Delete(&models.UploadedFile{}).Error
	for _, filename := range filenames {
		_ = os.Remove(filepath.Join(config.AppConfig.UploadDir, filepath.Base(filename)))
	}
}

func clippedImageExtension(contentType, sourceURL string) string {
	if extensions, _ := mime.ExtensionsByType(contentType); len(extensions) > 0 {
		for _, ext := range extensions {
			if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif" || ext == ".webp" || ext == ".avif" {
				return ext
			}
		}
	}
	if parsed, err := url.Parse(sourceURL); err == nil {
		ext := strings.ToLower(filepath.Ext(parsed.Path))
		if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif" || ext == ".webp" || ext == ".avif" {
			return ext
		}
	}
	return ".img"
}

func newClipperHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		ResponseHeaderTimeout: 20 * time.Second,
		TLSHandshakeTimeout:   20 * time.Second,
		IdleConnTimeout:       30 * time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			for _, candidate := range ips {
				if unsafeClipperIP(candidate.IP) {
					return nil, fmt.Errorf("private or local address is not allowed")
				}
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("host did not resolve")
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	}
	return &http.Client{Transport: transport}
}

func unsafeClipperIP(ip net.IP) bool {
	return ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast()
}
