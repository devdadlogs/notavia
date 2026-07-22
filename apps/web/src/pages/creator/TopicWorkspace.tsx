import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { type Content } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import {
  ArrowLeft,
  Bold,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  ExternalLink,
  FileSearch,
  FileVideo,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  LocateFixed,
  PanelLeft,
  PanelRight,
  Plus,
  Quote,
  Save,
  Send,
  Sparkles,
  Table2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  creatorService,
  type Platform,
  type StyleIssue,
  type Topic,
  type TopicBriefSuggestion,
  type TopicCoverage,
  type Work,
} from "../../services/creator";
import { ResizableImage } from "../../components/editor/extensions/ResizableImage";
import { Video } from "../../components/editor/extensions/Video";
import { TableHoverControls } from "../../components/editor/TableHoverControls";
import { uploadFile } from "../../utils/fileUpload";
import { compressImage } from "../../utils/imageCompressor";
import {
  applyMarkdownToolbarAction,
  insertMarkdownMedia,
  type MarkdownToolbarAction,
} from "../../utils/markdownToolbar";
import { errorMessage } from "../../utils/errors";
import "../../styles/editor.css";

const statuses = [
  ["idea", "想法"],
  ["preparing", "准备中"],
  ["writing", "写作中"],
  ["ready", "待发布"],
  ["published", "已发布"],
  ["archived", "归档"],
];
const platformLabel: Record<string, string> = {
  zhihu: "知乎长文",
  xiaohongshu: "小红书图文",
  short_video: "短视频口播",
};
const publicationLabel: Record<string, string> = {
  zhihu: "知乎",
  xiaohongshu: "小红书",
  bilibili: "B站",
  douyin: "抖音",
  wechat_video: "视频号",
};
const issueTypeLabel: Record<string, string> = {
  clarity: "观点清晰度",
  repetition: "重复表达",
  cliche: "空话套话",
  banned_phrase: "禁用表达",
  invented_experience: "经历真实性",
  anxiety: "夸大焦虑",
  unsourced_fact: "事实来源",
  tone: "口语表达",
};
const severityLabel: Record<string, string> = {
  high: "优先处理",
  medium: "建议处理",
  low: "可以优化",
};
type MarkdownStorage = {
  markdown?: {
    getMarkdown: () => string;
    parser: { parse: (content: string) => unknown };
  };
};
type MaterialSearchResult = Awaited<
  ReturnType<typeof creatorService.retrieve>
>[number];
const getMarkdownStorage = (editor: Editor) =>
  (editor.storage as unknown as MarkdownStorage).markdown;

export default function TopicWorkspace() {
  const { id } = useParams();
  const nav = useNavigate();
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const syncingEditorRef = useRef(false);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [coverage, setCoverage] = useState<TopicCoverage | null>(null);
  const [materials, setMaterials] = useState<MaterialSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Work | null>(null);
  const [content, setContent] = useState("");
  const [contentJson, setContentJson] = useState("");
  const [editorMode, setEditorMode] = useState<"rich" | "markdown">("rich");
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [workSaveState, setWorkSaveState] = useState<
    "saved" | "saving" | "unsaved" | "error"
  >("saved");
  const [issues, setIssues] = useState<StyleIssue[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [notice, setNotice] = useState<{
    kind: "working" | "success" | "error";
    text: string;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [preference, setPreference] = useState("");
  const [topicDirty, setTopicDirty] = useState(false);
  const [suggestion, setSuggestion] = useState<TopicBriefSuggestion | null>(
    null,
  );
  const [mobilePanel, setMobilePanel] = useState<"info" | "assistant" | null>(
    null,
  );
  const [pub, setPub] = useState({
    platform: "zhihu",
    url: "",
    notes: "",
    views: 0,
    likes: 0,
    favorites: 0,
    comments: 0,
  });
  const editor = useEditor({
    extensions: [
      StarterKit,
      ResizableImage,
      Video,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown,
      Placeholder.configure({ placeholder: "开始写作…" }),
    ],
    content: "",
    editorProps: {
      handlePaste: (view, event) => {
        const file = event.clipboardData?.files?.[0];
        if (!file?.type.startsWith("image/")) return false;
        event.preventDefault();
        const position = view.state.selection.from;
        void compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.82,
        })
          .then(uploadFile)
          .then((url) => {
            const node = view.state.schema.nodes.resizableImage.create({
              src: url,
              alt: file.name,
            });
            view.dispatch(view.state.tr.insert(position, node));
          })
          .catch(() =>
            setNotice({
              kind: "error",
              text: "粘贴图片上传失败，请检查图片大小后重试。",
            }),
          );
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const file = event.dataTransfer?.files?.[0];
        if (moved || !file?.type.startsWith("image/")) return false;
        event.preventDefault();
        const position =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          view.state.selection.from;
        void compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.82,
        })
          .then(uploadFile)
          .then((url) => {
            const node = view.state.schema.nodes.resizableImage.create({
              src: url,
              alt: file.name,
            });
            view.dispatch(view.state.tr.insert(position, node));
          })
          .catch(() =>
            setNotice({
              kind: "error",
              text: "拖入图片上传失败，请检查图片大小后重试。",
            }),
          );
        return true;
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      if (syncingEditorRef.current) return;
      const markdown =
        getMarkdownStorage(nextEditor)?.getMarkdown() ||
        nextEditor.getText({ blockSeparator: "\n" });
      setContent(markdown);
      setContentJson(JSON.stringify(nextEditor.getJSON()));
      setWorkSaveState("unsaved");
    },
  });
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const t = await creatorService.getTopic(id);
      const nextCoverage = await creatorService
        .getTopicCoverage(id)
        .catch(() => null);
      setTopic(t);
      setCoverage(nextCoverage);
      setLoadError("");
      const main =
        t.works?.find((w) => w.platform === "zhihu") || t.works?.[0] || null;
      setActive((a) =>
        a ? t.works?.find((w) => w.id === a.id) || main : main,
      );
    } catch (error: unknown) {
      setLoadError(errorMessage(error, "选题加载失败"));
    }
  }, [id]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const next = {
        content: active?.content || "",
        contentJson: active?.contentJson || "",
      };
      setContent(next.content);
      setContentJson(next.contentJson);
      setWorkSaveState("saved");
      if (editor && !editor.isDestroyed) {
        const markdown = getMarkdownStorage(editor);
        let documentContent = (markdown?.parser.parse(next.content) ||
          next.content) as Content;
        if (next.contentJson) {
          try {
            documentContent = JSON.parse(next.contentJson) as Content;
          } catch {
            /* Old or invalid rich-text data falls back to Markdown. */
          }
        }
        syncingEditorRef.current = true;
        editor.commands.setContent(documentContent, { emitUpdate: false });
        syncingEditorRef.current = false;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active?.id, active?.content, active?.contentJson, editor]);
  const selected = useMemo(
    () => new Set(topic?.materials?.map((m) => m.noteId) || []),
    [topic?.materials],
  );
  const selectedIdeas = useMemo(() => topic?.ideas || [], [topic?.ideas]);
  const updateField = (key: keyof Topic, value: string) => {
    setTopic((t) => (t ? { ...t, [key]: value } : t));
    setTopicDirty(true);
  };
  const saveTopic = async () => {
    if (!topic) return;
    setBusy("save-topic");
    setNotice({ kind: "working", text: "正在保存选题…" });
    try {
      const saved = await creatorService.updateTopic(topic.id, topic);
      setTopic((current) =>
        current
          ? {
              ...current,
              ...saved,
              materials: current.materials,
              ideas: current.ideas,
              works: current.works,
            }
          : current,
      );
      setTopicDirty(false);
      try {
        setCoverage(await creatorService.getTopicCoverage(topic.id));
        setNotice({
          kind: "success",
          text: "选题已保存，刚才的修改已经生效。",
        });
      } catch {
        setNotice({
          kind: "success",
          text: "选题已保存；写作准备状态会在下次打开时刷新。",
        });
      }
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(error, "选题保存失败，请重试。"),
      });
    } finally {
      setBusy("");
    }
  };
  const suggestBrief = async () => {
    if (!topic) return;
    setBusy("suggest-topic");
    setNotice({
      kind: "working",
      text: "正在阅读已选素材和个人观点，整理选题建议…",
    });
    try {
      const result = await creatorService.suggestTopicBrief(topic.id);
      setSuggestion(result);
      setNotice({
        kind: "success",
        text: "选题建议已生成。确认后再采用，不会直接覆盖你的内容。",
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(error, "选题建议生成失败，请检查 AI 配置后重试。"),
      });
    } finally {
      setBusy("");
    }
  };
  const applySuggestion = () => {
    if (!suggestion) return;
    setTopic((current) =>
      current
        ? {
            ...current,
            title: suggestion.title,
            coreQuestion: suggestion.coreQuestion,
            targetAudience: suggestion.targetAudience,
            conclusion: suggestion.conclusion,
            desiredAction: suggestion.desiredAction,
          }
        : current,
    );
    setTopicDirty(true);
    setSuggestion(null);
    setNotice({
      kind: "success",
      text: "建议已填入左侧。你可以继续修改，确认后点击“保存选题”。",
    });
  };
  const search = async () => {
    if (!query.trim()) return;
    setBusy("search");
    setNotice({ kind: "working", text: "正在检索历史素材…" });
    try {
      const results = await creatorService.retrieve(query);
      setMaterials(results);
      setNotice({
        kind: "success",
        text: results.length
          ? `找到 ${results.length} 条相关素材。`
          : "没有找到相关素材，可以换个关键词。",
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(error, "素材检索失败，请重试。"),
      });
    } finally {
      setBusy("");
    }
  };
  const canRefreshTopic = () => {
    if (!topicDirty) return true;
    setNotice({
      kind: "error",
      text: "左侧还有未保存的选题信息。请先保存，再调整素材或观点。",
    });
    return false;
  };
  const add = async (noteId: string) => {
    if (!topic || !canRefreshTopic()) return;
    await creatorService.addMaterial(topic.id, noteId);
    await load();
  };
  const remove = async (noteId: string) => {
    if (!topic || !canRefreshTopic()) return;
    await creatorService.removeMaterial(topic.id, noteId);
    await load();
  };
  const removeIdea = async (ideaId: string) => {
    if (!topic || !canRefreshTopic()) return;
    await creatorService.removeIdea(topic.id, ideaId);
    await load();
  };
  const generate = async () => {
    if (!topic) return;
    if (topicDirty) {
      setNotice({
        kind: "error",
        text: "选题信息还有未保存的修改。请先保存选题，再生成草稿。",
      });
      return;
    }
    if (coverage && !coverage.readyForDraft) {
      const firstRequired = coverage.gaps.find((gap) => gap.required);
      setNotice({
        kind: "error",
        text: `${firstRequired?.label || "选题信息还不完整"}。先在左侧补齐，再生成草稿。`,
      });
      return;
    }
    const isRegeneration = (topic.works?.length || 0) > 0;
    setBusy("draft");
    setNotice({
      kind: "working",
      text: isRegeneration
        ? "正在按最新选题重新组织一篇知乎草稿。原草稿会保留，请保持页面打开。"
        : "正在阅读素材、组织观点并生成知乎草稿。这一步可能需要几十秒，请保持页面打开。",
    });
    try {
      const r = await creatorService.generateDraft(topic.id, [...selected]);
      const citationWarning =
        r.citationStatus === "unavailable"
          ? " 这版没有可用引用，发布前请人工核对。"
          : "";
      setActive(r.work);
      setContent(r.work.content);
      setTopic((current) =>
        current
          ? {
              ...current,
              status: "writing",
              works: [...(current.works || []), r.work],
            }
          : current,
      );
      setNotice({
        kind: "success",
        text: isRegeneration
          ? `已按最新选题生成一篇新草稿并打开。旧版本仍保留在上方作品菜单中${r.risks?.length ? `，有 ${r.risks.length} 项事实需要核实` : ""}。${citationWarning}`
          : r.risks?.length
            ? `草稿已生成并打开，有 ${r.risks.length} 项事实需要核实。${citationWarning}`
            : "草稿已生成并打开，引用信息也已保存。",
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(error, "草稿生成失败，请检查 AI 服务后重试。"),
      });
    } finally {
      setBusy("");
    }
  };
  const persistWork = useCallback(
    async (status = active?.status || "draft", confirmedPreference = "") => {
      if (!active) return null;
      const snapshot = { title: active.title, content, contentJson };
      const w = await creatorService.updateWork(active.id, {
        title: snapshot.title,
        content: snapshot.content,
        contentJson: snapshot.contentJson,
        status,
        preference: confirmedPreference,
        preferenceConfirmed: !!confirmedPreference,
      });
      setActive((current) => (current ? { ...current, ...w } : w));
      setTopic((current) =>
        current
          ? {
              ...current,
              works: current.works?.map((item) =>
                item.id === w.id ? { ...item, ...w } : item,
              ),
            }
          : current,
      );
      setWorkSaveState("saved");
      return w;
    },
    [active, content, contentJson],
  );
  const saveWork = useCallback(
    async ({
      status = active?.status || "draft",
      quiet = false,
    }: { status?: string; quiet?: boolean } = {}) => {
      if (!active) return;
      setBusy("save-work");
      setWorkSaveState("saving");
      if (!quiet)
        setNotice({ kind: "working", text: "正在保存作品和修改记录…" });
      try {
        await persistWork(status);
        if (!quiet)
          setNotice({ kind: "success", text: "作品和修改记录已保存。" });
      } catch (error: unknown) {
        setWorkSaveState("error");
        if (!quiet)
          setNotice({
            kind: "error",
            text: errorMessage(error, "作品保存失败，请重试。"),
          });
      } finally {
        setBusy("");
      }
    },
    [active, persistWork],
  );
  const changeReadyState = async () => {
    if (!active || !topic) return;
    const nextReady = active.status !== "ready";
    setBusy("ready-work");
    setNotice({
      kind: "working",
      text: nextReady
        ? "正在保存作品，并移入待发布…"
        : "正在保存作品，并退回继续修改…",
    });
    try {
      await persistWork(nextReady ? "ready" : "draft");
      const nextStatus = nextReady ? "ready" : "writing";
      const savedTopic = await creatorService.updateTopic(topic.id, {
        ...topic,
        status: nextStatus,
      });
      setTopic((current) =>
        current
          ? {
              ...current,
              ...savedTopic,
              materials: current.materials,
              ideas: current.ideas,
              works: current.works,
            }
          : current,
      );
      setNotice({
        kind: "success",
        text: nextReady
          ? "已进入待发布：可以在右侧登记实际发布链接和数据。"
          : "已退回写作中：你可以继续修改，内容会自动保存。",
      });
    } catch (error: unknown) {
      setWorkSaveState("error");
      setNotice({
        kind: "error",
        text: errorMessage(error, "更新发布状态失败，请重试。"),
      });
    } finally {
      setBusy("");
    }
  };
  const updateWorkTitle = (title: string) => {
    setActive((current) => (current ? { ...current, title } : current));
    setWorkSaveState("unsaved");
  };
  const updateWorkContent = (nextContent: string) => {
    setContent(nextContent);
    setContentJson("");
    setWorkSaveState("unsaved");
  };
  const switchEditorMode = (nextMode: "rich" | "markdown") => {
    if (nextMode === editorMode) return;
    if (nextMode === "markdown" && editor && !editor.isDestroyed) {
      setContent(
        getMarkdownStorage(editor)?.getMarkdown() ||
          editor.getText({ blockSeparator: "\n" }),
      );
      setContentJson(JSON.stringify(editor.getJSON()));
    }
    if (nextMode === "rich" && editor && !editor.isDestroyed) {
      const markdown = getMarkdownStorage(editor);
      let documentContent = (markdown?.parser.parse(content) ||
        content) as Content;
      if (contentJson) {
        try {
          documentContent = JSON.parse(contentJson) as Content;
        } catch {
          /* Markdown is the safe fallback. */
        }
      }
      syncingEditorRef.current = true;
      editor.commands.setContent(documentContent, { emitUpdate: false });
      syncingEditorRef.current = false;
    }
    setHeadingMenuOpen(false);
    setEditorMode(nextMode);
  };
  const handleMarkdownFormat = (
    action: MarkdownToolbarAction,
    options?: { level?: number },
  ) => {
    const textarea = contentRef.current;
    if (!textarea) return;
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    let edit;
    if (action === "link") {
      const raw = window.prompt(
        "粘贴链接地址（支持 https://、http:// 或 mailto:）",
        "",
      );
      if (raw === null) return;
      const href = raw.trim();
      if (!href) return;
      try {
        const parsed = new URL(href);
        if (!["http:", "https:", "mailto:"].includes(parsed.protocol))
          throw new Error();
        edit = applyMarkdownToolbarAction(textarea.value, selection, action, {
          href: parsed.href,
        });
      } catch {
        setNotice({
          kind: "error",
          text: "链接地址无效。请使用 http://、https:// 或 mailto: 开头。",
        });
        return;
      }
    } else
      edit = applyMarkdownToolbarAction(
        textarea.value,
        selection,
        action,
        options,
      );
    setContent(edit.content);
    setContentJson("");
    setWorkSaveState("unsaved");
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    }, 0);
  };
  const insertLink = () => {
    if (!editor) return;
    const current = editor.getAttributes("link").href || "";
    const raw = window.prompt(
      "粘贴链接地址（支持 https://、http:// 或 mailto:）",
      current,
    );
    if (raw === null) return;
    const href = raw.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    try {
      const parsed = new URL(href);
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol))
        throw new Error("unsupported");
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({
          href: parsed.href,
          target: "_blank",
          rel: "noopener noreferrer",
        })
        .run();
    } catch {
      setNotice({
        kind: "error",
        text: "链接地址无效。请使用 http://、https:// 或 mailto: 开头。",
      });
    }
  };
  const uploadMedia = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: "image" | "video",
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (editorMode === "rich" && (!editor || editor.isDestroyed)) return;
    setBusy("upload-media");
    setNotice({
      kind: "working",
      text: kind === "image" ? "正在压缩并插入图片…" : "正在上传并插入视频…",
    });
    try {
      const url = await uploadFile(
        kind === "image"
          ? await compressImage(file, {
              maxWidth: 1920,
              maxHeight: 1080,
              quality: 0.82,
            })
          : file,
      );
      if (editorMode === "rich" && editor && !editor.isDestroyed) {
        if (kind === "image")
          editor
            .chain()
            .focus()
            .setResizableImage({ src: url, alt: file.name, title: file.name })
            .run();
        else editor.chain().focus().setVideo({ src: url }).run();
      } else if (editorMode === "markdown") {
        const textarea = contentRef.current;
        if (!textarea) throw new Error("Markdown 编辑器尚未就绪");
        const edit = insertMarkdownMedia(
          textarea.value,
          { start: textarea.selectionStart, end: textarea.selectionEnd },
          { kind, url, fileName: file.name },
        );
        setContent(edit.content);
        setContentJson("");
        setWorkSaveState("unsaved");
        window.setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
        }, 0);
      }
      setNotice({
        kind: "success",
        text: kind === "image" ? "图片已插入正文。" : "视频已插入正文。",
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(
          error,
          `${kind === "image" ? "图片" : "视频"}上传失败。单个文件最大 50MB，请检查后重试。`,
        ),
      });
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    if (!active || workSaveState !== "unsaved" || busy) return;
    const timer = window.setTimeout(() => {
      saveWork({ quiet: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [active, content, workSaveState, busy, saveWork]);
  const review = async () => {
    if (!active) return;
    setBusy("review");
    setNotice({ kind: "working", text: "正在保存当前版本并检查表达风格…" });
    try {
      const saved = await persistWork();
      if (!saved) return;
      const r = await creatorService.reviewStyle(saved.id);
      setIssues(r.issues || []);
      setNotice({
        kind: "success",
        text: r.issues?.length
          ? `检查完成，发现 ${r.issues.length} 项可以改进。`
          : "检查完成，没有发现明显问题。",
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(error, "风格检查失败，请检查 AI 服务。"),
      });
    } finally {
      setBusy("");
    }
  };
  const transform = async (platform: Platform) => {
    if (!active || active.platform !== "zhihu") return;
    setBusy(platform);
    setNotice({
      kind: "working",
      text: `正在保存主版本并生成${platformLabel[platform]}…`,
    });
    try {
      const saved = await persistWork();
      if (!saved) return;
      const r = await creatorService.transform(saved.id, platform);
      setActive(r.work);
      setContent(r.work.content);
      setIssues([]);
      setRisks(r.risks || []);
      setTopic((current) =>
        current
          ? { ...current, works: [...(current.works || []), r.work] }
          : current,
      );
      const formatNote =
        platform === "xiaohongshu"
          ? "已切换到“小红书图文”版本：中间区域是可编辑文案，内容包含标题、钩子和配图建议；图片不会自动生成。"
          : "已切换到“短视频口播”版本：中间区域是可编辑的口播和画面提示。";
      setNotice({
        kind: "success",
        text: `${formatNote}${r.risks?.length ? ` 另有 ${r.risks.length} 项需要核实。` : ""}`,
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(
          error,
          `${platformLabel[platform]}生成失败，请重试。`,
        ),
      });
    } finally {
      setBusy("");
    }
  };
  const savePreference = async () => {
    const rule = preference.trim();
    if (!active || !rule) return;
    setBusy("preference");
    setNotice({ kind: "working", text: "正在保存长期表达规则…" });
    try {
      await persistWork(active.status, rule);
      setPreference("");
      setNotice({
        kind: "success",
        text: "这条偏好已加入个人风格规则，后续生成和检查都会使用。",
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(error, "表达规则保存失败，请重试。"),
      });
    } finally {
      setBusy("");
    }
  };
  const locateIssue = (issue: StyleIssue) => {
    if (!issue.quote) return;
    const start = content.indexOf(issue.quote);
    if (start < 0) {
      setNotice({
        kind: "error",
        text: "正文已经变化，找不到检查时的原文片段。请重新检查。",
      });
      return;
    }
    setMobilePanel(null);
    switchEditorMode("markdown");
    window.setTimeout(() => {
      contentRef.current?.focus();
      contentRef.current?.setSelectionRange(start, start + issue.quote!.length);
    }, 200);
  };
  const applyIssue = (issue: StyleIssue) => {
    if (!issue.quote || !issue.replacement) return;
    const start = content.indexOf(issue.quote);
    if (start < 0) {
      setNotice({
        kind: "error",
        text: "正文已经变化，无法应用这条建议。请重新检查。",
      });
      return;
    }
    const nextContent = `${content.slice(0, start)}${issue.replacement}${content.slice(start + issue.quote.length)}`;
    setContent(nextContent);
    setContentJson("");
    setWorkSaveState("unsaved");
    if (editorMode === "rich" && editor && !editor.isDestroyed) {
      const markdown = getMarkdownStorage(editor);
      syncingEditorRef.current = true;
      editor.commands.setContent(
        markdown?.parser.parse(nextContent) || nextContent,
        { emitUpdate: false },
      );
      syncingEditorRef.current = false;
    }
    setIssues((current) => current.filter((item) => item !== issue));
    setNotice({ kind: "success", text: "建议已替换到正文，内容会自动保存。" });
  };
  const publish = async () => {
    if (!active || !pub.url) return;
    setBusy("publish");
    setNotice({ kind: "working", text: "正在保存发布记录…" });
    try {
      const record = await creatorService.createPublication({
        workId: active.id,
        ...pub,
        publishedAt: new Date().toISOString(),
      });
      setActive((current) =>
        current
          ? {
              ...current,
              publications: [...(current.publications || []), record],
            }
          : current,
      );
      setTopic((current) =>
        current
          ? {
              ...current,
              works: current.works?.map((item) =>
                item.id === active.id
                  ? {
                      ...item,
                      publications: [...(item.publications || []), record],
                    }
                  : item,
              ),
            }
          : current,
      );
      setPub({
        ...pub,
        url: "",
        notes: "",
        views: 0,
        likes: 0,
        favorites: 0,
        comments: 0,
      });
      setNotice({
        kind: "success",
        text: "发布记录已保存，并显示在下方历史记录中。",
      });
    } catch (error: unknown) {
      setNotice({
        kind: "error",
        text: errorMessage(error, "发布记录保存失败"),
      });
    } finally {
      setBusy("");
    }
  };
  if (loadError)
    return (
      <div style={{ padding: 40 }}>
        <p>{loadError}</p>
        <button className="btn btn-outline" onClick={() => nav("/")}>
          <ArrowLeft size={16} />
          返回工作台
        </button>{" "}
        <button className="btn btn-primary" onClick={load}>
          重试
        </button>
      </div>
    );
  if (!editor || !topic)
    return (
      <div style={{ padding: 40 }}>
        <Loader2 className="animate-spin" /> 加载选题...
      </div>
    );
  return (
    <div className="topic-workspace">
      {mobilePanel && (
        <button
          className="topic-panel-backdrop"
          aria-label="关闭侧栏"
          onClick={() => setMobilePanel(null)}
        />
      )}
      <aside
        className={`topic-info-panel${mobilePanel === "info" ? " is-open" : ""}`}
      >
        <div className="topic-panel-mobile-heading">
          <strong>选题信息</strong>
          <button
            onClick={() => setMobilePanel(null)}
            aria-label="关闭选题信息"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="btn"
          style={{ background: "transparent" }}
          onClick={() => nav("/")}
        >
          <ArrowLeft size={16} /> 工作台
        </button>
        <div className="topic-info-heading">
          <div>
            <h2>选题信息</h2>
            <p>先让 AI 根据素材打个底，再补上你的判断。</p>
          </div>
          <button
            className="topic-assist-button"
            onClick={suggestBrief}
            disabled={!!busy || selected.size === 0}
          >
            {busy === "suggest-topic" ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <WandSparkles size={14} />
            )}
            AI 帮我梳理
          </button>
        </div>
        {suggestion && (
          <div className="topic-suggestion-card">
            <div className="topic-suggestion-label">
              <Sparkles size={14} />
              基于当前素材的建议
            </div>
            <strong>{suggestion.title}</strong>
            <dl>
              <dt>核心问题</dt>
              <dd>{suggestion.coreQuestion}</dd>
              <dt>目标读者</dt>
              <dd>{suggestion.targetAudience}</dd>
              <dt>明确结论</dt>
              <dd>{suggestion.conclusion}</dd>
              <dt>读完以后</dt>
              <dd>{suggestion.desiredAction}</dd>
            </dl>
            <p>{suggestion.reason}</p>
            <div>
              <button className="btn btn-primary" onClick={applySuggestion}>
                <Check size={14} />
                采用并继续修改
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setSuggestion(null)}
              >
                暂不采用
              </button>
            </div>
          </div>
        )}
        <Field
          label="选题标题"
          hint="一句话说清这篇文章讨论什么"
          value={topic.title}
          onChange={(v) => updateField("title", v)}
        />
        <Field
          label="核心问题 *"
          hint="文章真正要回答的矛盾或疑问"
          area
          value={topic.coreQuestion}
          onChange={(v) => updateField("coreQuestion", v)}
        />
        <Field
          label="目标读者 *"
          hint="写具体处境，别写“不限”"
          area
          value={topic.targetAudience}
          onChange={(v) => updateField("targetAudience", v)}
        />
        <Field
          label="明确结论 *"
          hint="先写你相信的答案，后面仍可修改"
          area
          value={topic.conclusion}
          onChange={(v) => updateField("conclusion", v)}
        />
        <Field
          label="读完后的行动或认识 *"
          hint="希望读者只带走的一件事"
          area
          value={topic.desiredAction}
          onChange={(v) => updateField("desiredAction", v)}
        />
        <label style={labelStyle}>状态</label>
        <select
          value={topic.status}
          onChange={(e) => updateField("status", e.target.value)}
          style={inputStyle}
        >
          {statuses.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          className={`btn btn-primary topic-save-button${!topicDirty ? " is-saved" : ""}`}
          onClick={saveTopic}
          disabled={!!busy || !topicDirty}
        >
          {busy === "save-topic" ? (
            <Loader2 className="animate-spin" size={15} />
          ) : topicDirty ? (
            <Save size={15} />
          ) : (
            <Check size={15} />
          )}{" "}
          {busy === "save-topic"
            ? "正在保存…"
            : topicDirty
              ? "保存选题"
              : "已保存"}
        </button>
        <TopicCoveragePanel
          coverage={coverage}
          onOpenSource={(noteId) => nav(`/n/${noteId}`)}
        />
        <h3 style={{ fontSize: 15, marginTop: 26 }}>
          已选素材（{selected.size}）
        </h3>
        {topic.materials?.map((m) => (
          <div
            key={m.noteId}
            style={{
              padding: "10px 0",
              borderBottom: "1px solid var(--border-color)",
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button
                onClick={() => nav(`/n/${m.noteId}`)}
                style={{
                  border: 0,
                  background: "none",
                  color: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {m.note?.title || "素材"}
              </button>
              <button
                onClick={() => remove(m.noteId)}
                style={{
                  border: 0,
                  background: "none",
                  cursor: "pointer",
                  color: "var(--text-tertiary)",
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        {selectedIdeas.length > 0 && (
          <>
            <h3 style={{ fontSize: 15, marginTop: 24 }}>
              本篇采用的观点（{selectedIdeas.length}）
            </h3>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                lineHeight: 1.5,
              }}
            >
              这些是你的明确立场，生成草稿时会优先使用。
            </p>
            {selectedIdeas.map((link) => (
              <div
                key={link.ideaId}
                style={{
                  padding: "10px",
                  marginBottom: 7,
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                {link.idea?.sourceExcerpt && (
                  <div
                    style={{
                      paddingLeft: 7,
                      borderLeft: "2px solid #c9c4fb",
                      color: "var(--text-tertiary)",
                      marginBottom: 6,
                    }}
                  >
                    {link.idea.sourceExcerpt}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    justifyContent: "space-between",
                  }}
                >
                  <span>{link.idea?.content || "想法已删除"}</span>
                  <button
                    onClick={() => removeIdea(link.ideaId)}
                    aria-label="移除想法"
                    style={{
                      border: 0,
                      background: "none",
                      cursor: "pointer",
                      color: "var(--text-tertiary)",
                      alignSelf: "start",
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </aside>
      <main className="topic-workspace-main">
        <div className="topic-workspace-toolbar">
          <button
            className="topic-mobile-panel-button"
            onClick={() => setMobilePanel("info")}
          >
            <PanelLeft size={17} />
            <span>选题</span>
          </button>
          <select
            value={active?.id || ""}
            onChange={(e) => {
              const w =
                topic.works?.find((x) => x.id === e.target.value) || null;
              setActive(w);
              setIssues([]);
              setRisks([]);
            }}
            style={{
              ...inputStyle,
              width: "clamp(300px, 34vw, 520px)",
              flex: "0 1 520px",
            }}
          >
            <option value="">尚未生成作品</option>
            {topic.works?.map((w) => (
              <option key={w.id} value={w.id}>
                {platformLabel[w.platform]} · {w.title || "未命名"}
              </option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          {active && (
            <>
              <button
                type="button"
                className={`topic-work-save-state is-${workSaveState}`}
                onClick={
                  workSaveState === "error" ? () => saveWork() : undefined
                }
                disabled={workSaveState !== "error"}
                aria-live="polite"
              >
                {workSaveState === "saving" && (
                  <Loader2 className="animate-spin" size={14} />
                )}{" "}
                {workSaveState === "saved" && <Check size={14} />}{" "}
                {workSaveState === "error"
                  ? "自动保存失败，点击重试"
                  : workSaveState === "unsaved"
                    ? "正在编辑…"
                    : workSaveState === "saving"
                      ? "正在保存…"
                      : "已自动保存"}
              </button>
              {active.platform === "zhihu" && (
                <button
                  className="topic-toolbar-regenerate"
                  onClick={generate}
                  disabled={!!busy || selected.size === 0}
                  title="按最新选题重新生成草稿"
                >
                  {busy === "draft" ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <WandSparkles size={14} />
                  )}
                  <span>重生成</span>
                </button>
              )}
              <button
                className="btn btn-primary topic-work-ready"
                onClick={changeReadyState}
                disabled={!!busy}
              >
                {busy === "ready-work" ? (
                  <Loader2 className="animate-spin" size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                <span>
                  {active.status === "ready"
                    ? "退回继续修改"
                    : "完成写作，进入待发布"}
                </span>
              </button>
            </>
          )}
          <button
            className="topic-mobile-panel-button"
            onClick={() => setMobilePanel("assistant")}
          >
            <span>助手</span>
            <PanelRight size={17} />
          </button>
        </div>
        {notice && (
          <div
            className={`topic-operation-notice is-${notice.kind}`}
            role="status"
            aria-live="polite"
          >
            {notice.kind === "working" && (
              <Loader2 className="animate-spin" size={16} />
            )}
            <span>{notice.text}</span>
            {notice.kind !== "working" && (
              <button onClick={() => setNotice(null)} aria-label="关闭提示">
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {active ? (
          <>
            <input
              className="topic-work-title"
              value={active.title}
              onChange={(e) => updateWorkTitle(e.target.value)}
              placeholder="作品标题"
            />
            <div className="topic-editor-mode-bar">
              <div role="tablist" aria-label="正文编辑模式">
                <button
                  role="tab"
                  aria-selected={editorMode === "rich"}
                  className={editorMode === "rich" ? "is-active" : ""}
                  onClick={() => switchEditorMode("rich")}
                >
                  富文本
                </button>
                <button
                  role="tab"
                  aria-selected={editorMode === "markdown"}
                  className={editorMode === "markdown" ? "is-active" : ""}
                  onClick={() => switchEditorMode("markdown")}
                >
                  Markdown
                </button>
              </div>
              <div className="topic-rich-toolbar" aria-label="格式工具">
                <div className="topic-heading-menu">
                  <button
                    type="button"
                    className={
                      editorMode === "rich" && editor?.isActive("heading")
                        ? "is-active"
                        : ""
                    }
                    onClick={() => setHeadingMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={headingMenuOpen}
                    title="标题级别"
                  >
                    H<ChevronDown size={12} />
                  </button>
                  {headingMenuOpen && (
                    <div role="menu">
                      {[1, 2, 3, 4, 5, 6].map((level) => (
                        <button
                          type="button"
                          role="menuitem"
                          key={level}
                          className={
                            editorMode === "rich" &&
                            editor?.isActive("heading", { level })
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
                            if (editorMode === "rich") {
                              editor
                                ?.chain()
                                .focus()
                                .toggleHeading({
                                  level: level as 1 | 2 | 3 | 4 | 5 | 6,
                                })
                                .run();
                            } else {
                              handleMarkdownFormat("heading", { level });
                            }
                            setHeadingMenuOpen(false);
                          }}
                        >
                          H{level} 标题
                        </button>
                      ))}
                      {editorMode === "rich" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            editor?.chain().focus().setParagraph().run();
                            setHeadingMenuOpen(false);
                          }}
                        >
                          正文
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich")
                      editor?.chain().focus().toggleBold().run();
                    else handleMarkdownFormat("bold");
                  }}
                  className={
                    editorMode === "rich" && editor?.isActive("bold")
                      ? "is-active"
                      : ""
                  }
                  title="加粗"
                >
                  <Bold size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich")
                      editor?.chain().focus().toggleItalic().run();
                    else handleMarkdownFormat("italic");
                  }}
                  className={
                    editorMode === "rich" && editor?.isActive("italic")
                      ? "is-active"
                      : ""
                  }
                  title="斜体"
                >
                  <Italic size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich")
                      editor?.chain().focus().toggleBulletList().run();
                    else handleMarkdownFormat("bulletList");
                  }}
                  className={
                    editorMode === "rich" && editor?.isActive("bulletList")
                      ? "is-active"
                      : ""
                  }
                  title="无序列表"
                >
                  <List size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich")
                      editor?.chain().focus().toggleOrderedList().run();
                    else handleMarkdownFormat("orderedList");
                  }}
                  className={
                    editorMode === "rich" && editor?.isActive("orderedList")
                      ? "is-active"
                      : ""
                  }
                  title="有序列表"
                >
                  <ListOrdered size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich")
                      editor?.chain().focus().toggleBlockquote().run();
                    else handleMarkdownFormat("blockquote");
                  }}
                  className={
                    editorMode === "rich" && editor?.isActive("blockquote")
                      ? "is-active"
                      : ""
                  }
                  title="引用"
                >
                  <Quote size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich")
                      editor?.chain().focus().toggleCodeBlock().run();
                    else handleMarkdownFormat("codeBlock");
                  }}
                  className={
                    editorMode === "rich" && editor?.isActive("codeBlock")
                      ? "is-active"
                      : ""
                  }
                  title="代码块"
                >
                  <Code2 size={14} />
                </button>
                <span className="topic-rich-toolbar-separator" />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={!!busy}
                  title="插入图片"
                >
                  <ImagePlus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={!!busy}
                  title="插入视频"
                >
                  <FileVideo size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich")
                      editor
                        ?.chain()
                        .focus()
                        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                        .run();
                    else handleMarkdownFormat("table");
                  }}
                  title="插入 3×3 表格"
                >
                  <Table2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editorMode === "rich") insertLink();
                    else handleMarkdownFormat("link");
                  }}
                  className={
                    editorMode === "rich" && editor?.isActive("link")
                      ? "is-active"
                      : ""
                  }
                  title="插入或编辑超链接"
                >
                  <Link2 size={14} />
                </button>
              </div>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={(event) => void uploadMedia(event, "image")}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/ogg"
              hidden
              onChange={(event) => void uploadMedia(event, "video")}
            />
            {editorMode === "rich" ? (
              <>
                <EditorContent editor={editor} className="topic-rich-editor" />
                <TableHoverControls editor={editor} />
              </>
            ) : (
              <>
                <p className="topic-markdown-hint">
                  Markdown
                  模式下支持通过上方工具栏快捷插入文本格式、图片、视频、链接和表格。
                </p>
                <textarea
                  ref={contentRef}
                  className="topic-work-content topic-markdown-editor"
                  value={content}
                  onChange={(e) => updateWorkContent(e.target.value)}
                  placeholder="在这里直接编辑 Markdown…"
                  spellCheck={false}
                />
              </>
            )}
          </>
        ) : busy === "draft" ? (
          <div className="topic-generating-state">
            <div className="topic-generating-mark">
              <Loader2 className="animate-spin" />
            </div>
            <h2>正在把素材组织成文章</h2>
            <p>会先提取证据，再围绕你的观点搭建结构，最后补齐引用。</p>
            <div>
              <span>读取素材</span>
              <span>组织观点</span>
              <span>生成草稿</span>
            </div>
            <small>生成完成后会自动打开草稿，无需重复点击。</small>
          </div>
        ) : (
          <div className="topic-draft-start">
            <Sparkles size={36} />
            <h2>确认这次要写什么</h2>
            <p>AI 会参考已选素材，并优先围绕你明确采用的观点组织文章。</p>
            <div className="topic-draft-context">
              <div>
                <strong>{selected.size}</strong>
                <span>条参考素材</span>
              </div>
              <div>
                <strong>{selectedIdeas.length}</strong>
                <span>条个人观点</span>
              </div>
            </div>
            {selectedIdeas.length > 0 && (
              <div className="topic-draft-ideas">
                <span>本篇采用的观点</span>
                {selectedIdeas.map((link) => (
                  <blockquote key={link.ideaId}>
                    {link.idea?.content || "想法已删除"}
                  </blockquote>
                ))}
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={generate}
              disabled={selected.size === 0}
            >
              {topicDirty ? <Save size={15} /> : <PenIcon />}
              {topicDirty ? "先保存选题，再生成草稿" : "按以上内容生成知乎草稿"}
            </button>
            {topicDirty && (
              <small className="topic-draft-warning">
                左侧选题信息有未保存的修改。
              </small>
            )}
            {!topicDirty && selectedIdeas.length === 0 && (
              <small>
                目前只会参考原始素材。加入个人观点后，草稿会更接近你的真实立场。
              </small>
            )}
          </div>
        )}
      </main>
      <aside
        className={`topic-assistant-panel${mobilePanel === "assistant" ? " is-open" : ""}`}
      >
        <div className="topic-panel-mobile-heading">
          <strong>创作助手</strong>
          <button
            onClick={() => setMobilePanel(null)}
            aria-label="关闭创作助手"
          >
            <X size={18} />
          </button>
        </div>
        <h2 className="assistant-title">创作助手</h2>
        <section className="assistant-section assistant-search">
          <div className="assistant-search-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="查找历史素材"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              className="btn btn-outline"
              onClick={search}
              disabled={busy === "search"}
            >
              {busy === "search" ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <FileSearch size={15} />
              )}
            </button>
          </div>
          {materials.map((r) => (
            <div className="assistant-material-result" key={r.id}>
              <strong>{r.title}</strong>
              <span>{r.reason}</span>
              <p>{r.contentText}</p>
              <button
                className="btn btn-outline"
                disabled={selected.has(r.id)}
                onClick={() => add(r.id)}
              >
                <Plus size={12} />
                {selected.has(r.id) ? "已加入" : "加入选题"}
              </button>
            </div>
          ))}
        </section>
        {active && (
          <>
            <section className="assistant-section">
              <div className="assistant-section-heading">
                <div>
                  <h3>AI 操作</h3>
                  <p>先保存当前正文，再执行检查或转换。</p>
                </div>
              </div>
              <button
                className="assistant-action"
                onClick={review}
                disabled={!!busy}
              >
                {busy === "review" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                <span>
                  <strong>
                    {busy === "review" ? "正在检查…" : "表达风格检查"}
                  </strong>
                  <small>找出空话、重复、事实风险和语气问题</small>
                </span>
              </button>
              {active.platform === "zhihu" ? (
                <>
                  <button
                    className="assistant-action"
                    onClick={() => transform("xiaohongshu")}
                    disabled={!!busy}
                  >
                    {busy === "xiaohongshu" ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <WandSparkles size={16} />
                    )}
                    <span>
                      <strong>
                        {busy === "xiaohongshu"
                          ? "正在生成…"
                          : "生成小红书图文"}
                      </strong>
                      <small>标题、钩子、短段落和配图建议</small>
                    </span>
                  </button>
                  <button
                    className="assistant-action"
                    onClick={() => transform("short_video")}
                    disabled={!!busy}
                  >
                    {busy === "short_video" ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <WandSparkles size={16} />
                    )}
                    <span>
                      <strong>
                        {busy === "short_video"
                          ? "正在生成…"
                          : "生成短视频口播"}
                      </strong>
                      <small>前5秒开场、口播正文和画面提示</small>
                    </span>
                  </button>
                </>
              ) : (
                <button
                  className="assistant-back-main"
                  onClick={() => {
                    const main = topic.works?.find(
                      (w) => w.platform === "zhihu",
                    );
                    if (main) setActive(main);
                  }}
                >
                  返回知乎主版本继续转换
                </button>
              )}
            </section>
            {(issues.length > 0 || busy === "review") && (
              <section className="assistant-section assistant-review-results">
                <div className="assistant-section-heading">
                  <div>
                    <h3>这几处需要你决定</h3>
                    <p>
                      {busy === "review"
                        ? "正在逐段检查正文…"
                        : `共 ${issues.length} 条。每一条都告诉你改哪里、为什么、怎么处理。`}
                    </p>
                  </div>
                </div>
                {issues
                  .filter(
                    (issue) => issue.quote && issue.message && issue.suggestion,
                  )
                  .map((issue, i) => (
                    <article
                      className={`assistant-issue severity-${issue.severity}`}
                      key={`${issue.type}-${i}`}
                    >
                      <div className="assistant-issue-meta">
                        <span>{issueTypeLabel[issue.type] || "表达建议"}</span>
                        <em>{severityLabel[issue.severity]}</em>
                      </div>
                      <span className="assistant-issue-label">要改什么</span>
                      <strong>{issue.message}</strong>
                      <div className="assistant-issue-source">
                        <span>原文位置</span>
                        <blockquote>“{issue.quote}”</blockquote>
                      </div>
                      <div className="assistant-issue-advice">
                        <span>怎么处理</span>
                        <p>{issue.suggestion}</p>
                      </div>
                      <footer>
                        <button onClick={() => locateIssue(issue)}>
                          <LocateFixed size={12} />
                          定位并修改
                        </button>
                        {issue.replacement && (
                          <button
                            className="is-primary"
                            onClick={() => applyIssue(issue)}
                          >
                            <Check size={12} />
                            直接替换
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setIssues((current) =>
                              current.filter((item) => item !== issue),
                            )
                          }
                        >
                          这条不处理
                        </button>
                      </footer>
                    </article>
                  ))}
              </section>
            )}
            {risks.length > 0 && (
              <section className="assistant-section assistant-risks">
                <div className="assistant-section-heading">
                  <div>
                    <h3>转换后待核实</h3>
                    <p>发布前逐项确认</p>
                  </div>
                </div>
                {risks.map((risk, i) => (
                  <p key={i}>{risk}</p>
                ))}
              </section>
            )}
            <section className="assistant-section">
              <div className="assistant-section-heading">
                <div>
                  <h3>记住这次修改</h3>
                  <p>只有明确确认后才会成为长期规则。</p>
                </div>
              </div>
              <textarea
                value={preference}
                onChange={(e) => setPreference(e.target.value)}
                placeholder="例如：以后开头直接说结论，不要铺垫"
                style={{ ...inputStyle, minHeight: 76 }}
              />
              <button
                className="btn btn-outline assistant-wide-button"
                onClick={savePreference}
                disabled={!preference.trim() || !!busy}
              >
                {busy === "preference" ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                保存为长期表达规则
              </button>
            </section>
            <section className="assistant-section">
              <div className="assistant-section-heading">
                <div>
                  <h3>引用来源</h3>
                  <p>点击可回到素材核对上下文。</p>
                </div>
                <span>{active.citations?.length || 0}</span>
              </div>
              {active.citations?.length ? (
                active.citations.map((c) => (
                  <button
                    className="assistant-citation"
                    key={c.id}
                    onClick={() => c.noteId && nav(`/n/${c.noteId}`)}
                    disabled={!c.noteId}
                  >
                    <span>
                      <Link2 size={13} />
                      {c.marker} {c.sourceTitle || "模型补充"}
                    </span>
                    <p>
                      {c.sourceExcerpt ||
                        "这部分没有私人素材支持，请人工核实。"}
                    </p>
                  </button>
                ))
              ) : (
                <div className="assistant-empty">
                  当前版本没有可用引用。发布前请人工核对事实。
                </div>
              )}
            </section>
            <section className="assistant-section">
              <div className="assistant-section-heading">
                <div>
                  <h3>登记发布</h3>
                  <p>手工记录链接和表现，方便以后复盘。</p>
                </div>
              </div>
              <label className="assistant-field">
                <span>发布平台</span>
                <select
                  value={pub.platform}
                  onChange={(e) => setPub({ ...pub, platform: e.target.value })}
                  style={inputStyle}
                >
                  <option value="zhihu">知乎</option>
                  <option value="xiaohongshu">小红书</option>
                  <option value="bilibili">B站</option>
                  <option value="douyin">抖音</option>
                  <option value="wechat_video">视频号</option>
                </select>
              </label>
              <label className="assistant-field">
                <span>作品链接</span>
                <input
                  value={pub.url}
                  onChange={(e) => setPub({ ...pub, url: e.target.value })}
                  placeholder="https://"
                  style={inputStyle}
                />
              </label>
              <div className="assistant-metrics">
                {(["views", "likes", "favorites", "comments"] as const).map(
                  (k) => (
                    <label key={k}>
                      <span>
                        {
                          {
                            views: "阅读",
                            likes: "点赞",
                            favorites: "收藏",
                            comments: "评论",
                          }[k]
                        }
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={pub[k]}
                        onChange={(e) =>
                          setPub({
                            ...pub,
                            [k]: Math.max(0, Number(e.target.value)),
                          })
                        }
                        style={inputStyle}
                      />
                    </label>
                  ),
                )}
              </div>
              <label className="assistant-field">
                <span>复盘备注</span>
                <textarea
                  value={pub.notes}
                  onChange={(e) => setPub({ ...pub, notes: e.target.value })}
                  placeholder="这次什么有效，什么需要改"
                  style={{ ...inputStyle, minHeight: 70 }}
                />
              </label>
              <button
                className="btn btn-primary assistant-wide-button"
                onClick={publish}
                disabled={!pub.url || !!busy}
              >
                {busy === "publish" ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Send size={14} />
                )}
                保存发布记录
              </button>
              {active.publications?.length ? (
                <div className="assistant-publications">
                  <strong>历史发布</strong>
                  {active.publications.map((record) => (
                    <article key={record.id}>
                      <div>
                        <span>
                          {publicationLabel[record.platform] || record.platform}
                        </span>
                        <time>
                          {new Date(record.publishedAt).toLocaleDateString(
                            "zh-CN",
                          )}
                        </time>
                      </div>
                      <p>
                        {record.views} 阅读 · {record.likes} 点赞 ·{" "}
                        {record.favorites} 收藏
                      </p>
                      <a href={record.url} target="_blank" rel="noreferrer">
                        打开作品
                        <ExternalLink size={11} />
                      </a>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
function Field({
  label,
  hint,
  value,
  onChange,
  area,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {hint && <span className="topic-field-hint">{hint}</span>}
      {area ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, minHeight: 68, resize: "vertical" }}
        />
      ) : (
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  );
}
function TopicCoveragePanel({
  coverage,
  onOpenSource,
}: {
  coverage: TopicCoverage | null;
  onOpenSource: (noteId: string) => void;
}) {
  if (!coverage) return null;
  return (
    <section
      className={`topic-coverage${coverage.readyForDraft ? " is-ready" : ""}`}
    >
      <header>
        <div>
          <span>写作准备</span>
          <strong>
            {coverage.readyForDraft ? "可以生成草稿" : "还需要补齐几项"}
          </strong>
        </div>
        <small>
          {coverage.readyForDraft
            ? "素材和选题信息已经够用。仍请逐项核对下方事实。"
            : "补齐带 * 的选题信息和来源素材后，才能生成草稿。"}
        </small>
      </header>
      <div className="topic-coverage-stats">
        <span>
          <b>{coverage.materialCount}</b> 条来源
        </span>
        <span>
          <b>{coverage.viewpointCount}</b> 条观点
        </span>
        <span>
          <b>{coverage.factCount}</b> 项事实
        </span>
        <span>
          <b>{coverage.verificationItems.length}</b> 项待核实
        </span>
      </div>
      {coverage.gaps.length > 0 && (
        <div className="topic-coverage-gaps">
          {coverage.gaps.map((gap) => (
            <article
              key={gap.key}
              className={gap.required ? "is-required" : ""}
            >
              <strong>
                {gap.required ? "需要补齐" : "建议补充"} · {gap.label}
              </strong>
              <p>{gap.message}</p>
            </article>
          ))}
        </div>
      )}
      {coverage.verificationItems.length > 0 && (
        <div className="topic-coverage-verifications">
          <strong>发布前核实</strong>
          {coverage.verificationItems.map((item, index) => (
            <button
              key={`${item.noteId}-${index}`}
              onClick={() => onOpenSource(item.noteId)}
            >
              <span>{item.title || "来源素材"}</span>
              <p>{item.content}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
function PenIcon() {
  return <Sparkles size={15} />;
}
const labelStyle = {
  display: "block",
  fontSize: 11,
  color: "var(--text-secondary)",
  marginBottom: 5,
} as const;
const inputStyle = {
  width: "100%",
  padding: "9px 10px",
  border: "1px solid var(--border-color)",
  borderRadius: 7,
  background: "var(--bg-input)",
  color: "inherit",
  boxSizing: "border-box",
} as const;
