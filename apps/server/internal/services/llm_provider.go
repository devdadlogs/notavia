package services

import (
	"encoding/json"
	"fmt"
	"strings"
)

// LLMProvider is the universal interface for large language model inference.
type LLMProvider interface {
	CheckHealth() (bool, error)
	ListModels() ([]string, error)
	Generate(prompt string) (string, error)
	GenerateJSON(prompt string) (string, error)
	GenerateStream(prompt string, outChan chan<- string, errChan chan<- error)
	Embed(text string) ([]float32, error)
	TranscribeAudio(filePath string) (string, error)
}

// Ensure interface compliance
var _ LLMProvider = (*OllamaService)(nil)

// -- High-Level Business Tasks --
// These functions orchestrate the prompts and use the underlying provider to generate content.

func SummarizeStream(provider LLMProvider, content string, mode string, outChan chan<- string, errChan chan<- error) {
	runes := []rune(content)
	const maxRuneLen = 4000

	if len(runes) <= maxRuneLen {
		// Document is short enough, summarize directly.
		var prompt string
		switch mode {
		case "brief":
			prompt = fmt.Sprintf(`请用三句话简洁地总结以下笔记内容。只输出总结，不要添加任何前缀或解释。

笔记内容：
%s`, content)
		default:
			prompt = fmt.Sprintf(`请详细总结以下笔记内容，包含核心要点和关键信息。使用清晰的结构化格式。只输出总结。

笔记内容：
%s`, content)
		}
		go provider.GenerateStream(prompt, outChan, errChan)
		return
	}

	// Document is too long, use Map-Reduce chunking strategy
	go func() {
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("panic during summarization: %v", r)
				close(outChan)
				close(errChan)
			}
		}()

		// 1. Chunking
		var chunks []string
		for i := 0; i < len(runes); i += maxRuneLen {
			end := i + maxRuneLen
			if end > len(runes) {
				end = len(runes)
			}
			chunks = append(chunks, string(runes[i:end]))
		}

		outChan <- "⏳ 文档较长，已开启分块深度阅读模式...\n\n"

		// 2. Map Phase
		var summaries []string
		for i, chunk := range chunks {
			outChan <- fmt.Sprintf("⏳ 正在提炼第 %d/%d 部分...\n", i+1, len(chunks))

			mapPrompt := fmt.Sprintf(`请概括以下文档片段的核心要点（只需要点，无需连贯成文）：

片段内容：
%s`, chunk)

			summary, err := provider.Generate(mapPrompt)
			if err != nil {
				errChan <- fmt.Errorf("chunk %d generation failed: %w", i+1, err)
				close(outChan)
				return
			}
			summaries = append(summaries, summary)
		}

		outChan <- "\n💡 正在生成最终全局总结...\n\n"

		// 3. Reduce Phase
		combinedSummaries := ""
		for i, s := range summaries {
			combinedSummaries += fmt.Sprintf("【第 %d 部分要点】：\n%s\n\n", i+1, s)
		}

		var finalPrompt string
		switch mode {
		case "brief":
			finalPrompt = fmt.Sprintf(`以下是一篇长文档各部分的核心要点。请基于这些要点，用三句话给出一个全局的、连贯的最终总结。只输出总结，不要包含格式标记。

各部分要点：
%s`, combinedSummaries)
		default:
			finalPrompt = fmt.Sprintf(`以下是一篇长文档各部分的核心要点。请综合这些信息，生成一份详尽、结构清晰的全局总结。

各部分要点：
%s`, combinedSummaries)
		}

		// The final stream will take over and automatically close the channels when done.
		provider.GenerateStream(finalPrompt, outChan, errChan)
	}()
}

func ExtractKeyPointsStream(provider LLMProvider, content string, outChan chan<- string, errChan chan<- error) {
	runes := []rune(content)
	const maxRuneLen = 4000

	if len(runes) <= maxRuneLen {
		prompt := fmt.Sprintf(`从以下笔记内容中提取关键信息，按以下分类输出：

1. **核心观点**：主要论点和结论
2. **待办事项**：需要跟进的行动项
3. **关键数据**：重要的数字和指标
4. **决策项**：已做出或需要做出的决策

如果某个分类没有内容，则跳过。直接输出结果，不要添加前缀。

笔记内容：
%s`, content)
		go provider.GenerateStream(prompt, outChan, errChan)
		return
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("panic during extraction: %v", r)
				close(outChan)
				close(errChan)
			}
		}()

		var chunks []string
		for i := 0; i < len(runes); i += maxRuneLen {
			end := i + maxRuneLen
			if end > len(runes) {
				end = len(runes)
			}
			chunks = append(chunks, string(runes[i:end]))
		}

		outChan <- "⏳ 文档较长，已开启分块信息提取模式...\n\n"

		var extractedPoints []string
		for i, chunk := range chunks {
			outChan <- fmt.Sprintf("⏳ 正在扫读第 %d/%d 部分...\n", i+1, len(chunks))

			mapPrompt := fmt.Sprintf(`从以下笔记内容中提取关键信息，按核心观点、待办事项、关键数据、决策项分类输出。直接输出，无前缀。

片段内容：
%s`, chunk)

			summary, err := provider.Generate(mapPrompt)
			if err != nil {
				errChan <- fmt.Errorf("chunk %d generation failed: %w", i+1, err)
				close(outChan)
				return
			}
			extractedPoints = append(extractedPoints, summary)
		}

		outChan <- "\n💡 正在聚合提炼全局要点...\n\n"

		combined := ""
		for i, s := range extractedPoints {
			combined += fmt.Sprintf("【第 %d 部分要点】：\n%s\n\n", i+1, s)
		}

		finalPrompt := fmt.Sprintf(`以下是从一篇长文档不同部分提取的关键信息汇总。请你进行全局的去重、归纳和聚合，最终按照以下分类统一输出：

1. **核心观点**：
2. **待办事项**：
3. **关键数据**：
4. **决策项**：

如果某个分类没有内容，则跳过。直接输出结果，不要添加前缀。

各部分信息汇总：
%s`, combined)

		provider.GenerateStream(finalPrompt, outChan, errChan)
	}()
}

func ContinueWritingStream(provider LLMProvider, content string, outChan chan<- string, errChan chan<- error) {
	runes := []rune(content)
	if len(runes) > 4000 {
		// For continuation, we only care about the tail end of the context
		content = string(runes[len(runes)-4000:])
	}

	prompt := fmt.Sprintf(`请根据以下笔记内容的上下文和风格，自然地续写一到两段内容。直接输出续写内容，不要重复已有内容。

已有内容：
%s

续写：`, content)
	go provider.GenerateStream(prompt, outChan, errChan)
}

func RewriteStream(provider LLMProvider, content string, style string, outChan chan<- string, errChan chan<- error) {
	runes := []rune(content)
	if len(runes) > 4000 {
		content = string(runes[:4000]) // Truncate head safely
	}

	var styleDesc string
	switch style {
	case "formal":
		styleDesc = "正式、专业的风格"
	case "casual":
		styleDesc = "轻松、口语化的风格"
	case "concise":
		styleDesc = "简洁、精炼的风格，去除冗余"
	default:
		styleDesc = "更清晰、更流畅的风格"
	}

	prompt := fmt.Sprintf(`请将以下内容改写为%s。保留核心含义，只输出改写后的内容。

原文：
%s`, styleDesc, content)
	go provider.GenerateStream(prompt, outChan, errChan)
}

func SuggestTagsStream(provider LLMProvider, content string, outChan chan<- string, errChan chan<- error) {
	runes := []rune(content)
	if len(runes) > 4000 {
		content = string(runes[:4000]) // For tags, first 4000 chars are usually enough context
	}

	prompt := fmt.Sprintf(`作为专业的标签分类助手，你的任务是从以下笔记内容中提取 3-5 个分类标签。
请严格输出 JSON 格式。包含一个 "tags" 数组，数组里的每一项是一个标签字符串。绝对不要输出任何其他文字或解释！

示例格式：
{
  "tags": ["项目管理", "需求分析", "前端开发"]
}

笔记内容：
%s`, content)

	go func() {
		defer close(outChan)
		defer close(errChan)

		// This uses strict JSON generation format
		jsonStr, err := provider.GenerateJSON(prompt)
		if err != nil {
			errChan <- fmt.Errorf("tags extraction failed: %w", err)
			return
		}

		// Try to parse the JSON and extract the tags
		var result map[string][]string
		if err := json.Unmarshal([]byte(jsonStr), &result); err == nil && len(result["tags"]) > 0 {
			// Join tags cleanly and send to the stream as a single chunk
			outChan <- strings.Join(result["tags"], ", ")
		} else {
			// Fallback if parsing fails or tags are empty
			// Try to clean up any raw markdown wrapping like ```json
			cleanStr := strings.TrimPrefix(jsonStr, "```json")
			cleanStr = strings.TrimPrefix(cleanStr, "```")
			cleanStr = strings.TrimSuffix(cleanStr, "```")
			cleanStr = strings.TrimSpace(cleanStr)
			outChan <- cleanStr
		}
	}()
}
