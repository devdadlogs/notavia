package services

import "fmt"

// LLMProvider is the universal interface for large language model inference.
type LLMProvider interface {
	CheckHealth() (bool, error)
	ListModels() ([]string, error)
	GenerateStream(prompt string, outChan chan<- string, errChan chan<- error)
	Embed(text string) ([]float32, error)
}

// Ensure interface compliance
var _ LLMProvider = (*OllamaService)(nil)

// -- High-Level Business Tasks --
// These functions orchestrate the prompts and use the underlying provider to generate content.

func SummarizeStream(provider LLMProvider, content string, mode string, outChan chan<- string, errChan chan<- error) {
	var prompt string
	switch mode {
	case "brief":
		prompt = fmt.Sprintf(`请用三句话简洁地总结以下笔记内容。只输出总结，不要添加任何前缀或解释。

笔记内容：
%s`, content)
	default: // "detailed"
		prompt = fmt.Sprintf(`请详细总结以下笔记内容，包含核心要点和关键信息。使用清晰的结构化格式。只输出总结。

笔记内容：
%s`, content)
	}
	go provider.GenerateStream(prompt, outChan, errChan)
}

func ExtractKeyPointsStream(provider LLMProvider, content string, outChan chan<- string, errChan chan<- error) {
	prompt := fmt.Sprintf(`从以下笔记内容中提取关键信息，按以下分类输出：

1. **核心观点**：主要论点和结论
2. **待办事项**：需要跟进的行动项
3. **关键数据**：重要的数字和指标
4. **决策项**：已做出或需要做出的决策

如果某个分类没有内容，则跳过。直接输出结果，不要添加前缀。

笔记内容：
%s`, content)
	go provider.GenerateStream(prompt, outChan, errChan)
}

func ContinueWritingStream(provider LLMProvider, content string, outChan chan<- string, errChan chan<- error) {
	prompt := fmt.Sprintf(`请根据以下笔记内容的上下文和风格，自然地续写一到两段内容。直接输出续写内容，不要重复已有内容。

已有内容：
%s

续写：`, content)
	go provider.GenerateStream(prompt, outChan, errChan)
}

func RewriteStream(provider LLMProvider, content string, style string, outChan chan<- string, errChan chan<- error) {
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
	prompt := fmt.Sprintf(`根据以下笔记内容，推荐 3-5 个简短的分类标签。每个标签用逗号分隔，不要添加序号或其他格式。

笔记内容：
%s

推荐标签：`, content)
	go provider.GenerateStream(prompt, outChan, errChan)
}
