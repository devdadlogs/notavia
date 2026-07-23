import { useState } from "react";
import {
  ArrowRight,
  Lightbulb,
  Loader2,
  MessageCircle,
  PenLine,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import {
  creatorService,
  type CreatorSeed,
  type CreatorSeedAnswer,
} from "../../services/creator";
import { errorMessage } from "../../utils/errors";

type Step = "start" | "answer" | "seed";

function seedMaterialContent(
  prompt: string,
  answers: CreatorSeedAnswer[],
  seed: CreatorSeed,
) {
  return [
    "创作种子",
    `最初想法：${prompt}`,
    ...answers.flatMap((item, index) => [
      `追问 ${index + 1}：${item.question}`,
      `我的回答：${item.answer}`,
    ]),
    `经历与细节：${seed.experience}`,
    `我的判断：${seed.viewpoint}`,
    `值得继续问：${seed.coreQuestion}`,
  ].join("\n\n");
}

function toDocumentJSON(content: string) {
  return JSON.stringify({
    type: "doc",
    content: content.split("\n\n").map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  });
}

type CreativeSeedStarterProps = {
  compact?: boolean;
};

export default function CreativeSeedStarter({
  compact = false,
}: CreativeSeedStarterProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("start");
  const [prompt, setPrompt] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [seed, setSeed] = useState<CreatorSeed | null>(null);
  const [seedNoteId, setSeedNoteId] = useState<string | null>(null);
  const [seedTopicId, setSeedTopicId] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    "questions" | "seed" | "save" | "topic" | "write" | ""
  >("");
  const [message, setMessage] = useState("");

  const close = () => {
    if (busy) return;
    setOpen(false);
    setStep("start");
    setQuestions([]);
    setAnswers([]);
    setQuestionIndex(0);
    setSeed(null);
    setSeedNoteId(null);
    setSeedTopicId(null);
    setMessage("");
  };

  const start = async () => {
    const initialThought = prompt.trim();
    if (!initialThought) {
      setMessage("先用几句话说说最近发生了什么，或你一直想不明白什么。");
      return;
    }
    setBusy("questions");
    setMessage("");
    setSeed(null);
    setSeedNoteId(null);
    setSeedTopicId(null);
    try {
      const result = await creatorService.suggestSeedQuestions(initialThought);
      if (result.questions.length !== 3) throw new Error("没有得到完整追问");
      setQuestions(result.questions);
      setAnswers(["", "", ""]);
      setQuestionIndex(0);
      setStep("answer");
    } catch (error: unknown) {
      setMessage(
        errorMessage(error, "暂时无法生成追问，请检查 AI 配置后重试。"),
      );
    } finally {
      setBusy("");
    }
  };

  const answerCurrentQuestion = async () => {
    const currentAnswer = answers[questionIndex]?.trim();
    if (!currentAnswer) {
      setMessage("这不是考试，写下你真实记得的细节就行。");
      return;
    }
    setMessage("");
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    const completedAnswers = questions.map((question, index) => ({
      question,
      answer: answers[index]?.trim() || "",
    }));
    setBusy("seed");
    try {
      const createdSeed = await creatorService.createSeed(
        prompt.trim(),
        completedAnswers,
      );
      setSeed(createdSeed);
      try {
        setSeedNoteId(await createSeedMaterial(createdSeed));
      } catch (error: unknown) {
        setMessage(
          errorMessage(
            error,
            "创作种子已整理完成，但暂时无法保存。请在这里重试，内容不会丢失。",
          ),
        );
      }
      setStep("seed");
    } catch (error: unknown) {
      setMessage(
        errorMessage(error, "暂时无法整理创作种子，请检查 AI 配置后重试。"),
      );
    } finally {
      setBusy("");
    }
  };

  const createSeedMaterial = async (seedToSave: CreatorSeed) => {
    const content = seedMaterialContent(
      prompt.trim(),
      questions.map((question, index) => ({
        question,
        answer: answers[index]?.trim() || "",
      })),
      seedToSave,
    );
    const { data } = await api.post<{ id: string }>("/notes", {
      title: `创作种子：${seedToSave.title}`,
      contentText: content,
      contentJson: toDocumentJSON(content),
    });
    return data.id;
  };

  const ensureSeedMaterial = async () => {
    if (seedNoteId) return seedNoteId;
    if (!seed) throw new Error("创作种子不存在，请重新整理。");
    const noteId = await createSeedMaterial(seed);
    setSeedNoteId(noteId);
    return noteId;
  };

  const saveMaterial = async () => {
    setBusy("save");
    setMessage("");
    try {
      navigate(`/n/${await ensureSeedMaterial()}`);
    } catch (error: unknown) {
      setMessage(errorMessage(error, "创作种子保存失败，请重试。"));
    } finally {
      setBusy("");
    }
  };

  const ensureSeedTopic = async (status: "preparing" | "writing") => {
    const noteId = await ensureSeedMaterial();
    if (seedTopicId) return { topicId: seedTopicId, noteId };
    if (!seed) throw new Error("创作种子不存在，请重新整理。");
    const topic = await creatorService.createTopic({
      title: seed.title,
      coreQuestion: seed.coreQuestion,
      targetAudience: seed.targetAudience,
      conclusion: seed.conclusion,
      desiredAction: seed.desiredAction,
      status,
    });
    setSeedTopicId(topic.id);
    await creatorService.addMaterial(topic.id, noteId);
    const idea = await creatorService.createIdea(noteId, {
      content: seed.viewpoint,
      sourceExcerpt: seed.experience,
    });
    await creatorService.addIdea(topic.id, idea.id);
    return { topicId: topic.id, noteId };
  };

  const continueToTopic = async () => {
    setBusy("topic");
    setMessage("");
    try {
      const { topicId } = await ensureSeedTopic("preparing");
      navigate(`/topics/${topicId}`);
    } catch (error: unknown) {
      setMessage(errorMessage(error, "选题创建失败，请重试。"));
    } finally {
      setBusy("");
    }
  };

  const writeDraft = async () => {
    setBusy("write");
    setMessage("");
    try {
      const { topicId, noteId } = await ensureSeedTopic("writing");
      try {
        await creatorService.generateDraft(topicId, [noteId]);
        navigate(`/topics/${topicId}`);
      } catch (error: unknown) {
        setMessage(
          `${errorMessage(error, "知乎草稿暂时没有生成。")} 选题和创作种子已经保留，点击“继续形成选题”可打开工作区后重试。`,
        );
      }
    } catch (error: unknown) {
      setMessage(errorMessage(error, "写作准备失败，请重试。"));
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="capture-seed-action"
          onClick={() => setOpen(true)}
        >
          <MessageCircle size={14} /> 还没有想法？从一个念头开始
        </button>
      ) : (
        <section className="creator-zero-state">
          <div>
            <span>还没有素材或选题也没关系</span>
            <h2>从你最近想说的一件事开始。</h2>
            <p>说几句真实经历或困惑，AI 用三个问题帮你找到值得写的内容。</p>
          </div>
          <button onClick={() => setOpen(true)}>
            <MessageCircle size={17} /> 从零开始聊一聊 <ArrowRight size={16} />
          </button>
        </section>
      )}

      {open && (
        <div
          className="creative-seed-backdrop"
          role="presentation"
          onMouseDown={close}
        >
          <section
            className="creative-seed-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creative-seed-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>从零开始创作</span>
                <h2 id="creative-seed-title">先聊聊你想说的事</h2>
              </div>
              <button type="button" aria-label="关闭" onClick={close}>
                <X size={19} />
              </button>
            </header>

            {step === "start" && (
              <div className="creative-seed-step">
                <h3>最近有什么事，让你一直记得、介意或想反驳？</h3>
                <p>不用先想标题，也不用讲完整。写下你记得的片段就够了。</p>
                <textarea
                  autoFocus
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例如：今天开会时，一位同事说“人到中年就别折腾了”，我当时很想反驳……"
                />
                <button
                  className="creative-seed-primary"
                  onClick={start}
                  disabled={busy === "questions"}
                >
                  {busy === "questions" ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}{" "}
                  请 AI 问我三个问题
                </button>
              </div>
            )}

            {step === "answer" && (
              <div className="creative-seed-step">
                <div className="creative-seed-progress">
                  <span>
                    第 {questionIndex + 1} / {questions.length} 个问题
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${((questionIndex + 1) / questions.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <h3>{questions[questionIndex]}</h3>
                <p>尽量写具体：当时发生了什么、你怎么想、后来有什么变化。</p>
                <textarea
                  autoFocus
                  value={answers[questionIndex] || ""}
                  onChange={(event) =>
                    setAnswers((current) =>
                      current.map((answer, index) =>
                        index === questionIndex ? event.target.value : answer,
                      ),
                    )
                  }
                  placeholder="写下你的真实回答…"
                />
                <div className="creative-seed-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() =>
                      questionIndex > 0 &&
                      setQuestionIndex((current) => current - 1)
                    }
                    disabled={questionIndex === 0 || Boolean(busy)}
                  >
                    上一个
                  </button>
                  <button
                    className="creative-seed-primary"
                    onClick={answerCurrentQuestion}
                    disabled={Boolean(busy)}
                  >
                    {busy === "seed" ? (
                      <>
                        <Loader2 className="spin" size={17} /> 正在整理
                      </>
                    ) : questionIndex === questions.length - 1 ? (
                      "整理成创作种子"
                    ) : (
                      "下一个问题"
                    )}
                  </button>
                </div>
              </div>
            )}

            {step === "seed" && seed && (
              <div className="creative-seed-result">
                <div className="creative-seed-icon">
                  <Lightbulb size={24} />
                </div>
                <span>你的创作种子</span>
                <h3>{seed.title}</h3>
                <SeedField label="经历与细节" value={seed.experience} />
                <SeedField
                  label="你已经说出的判断"
                  value={seed.viewpoint}
                  emphasis
                />
                <SeedField
                  label="可以继续追问的问题"
                  value={seed.coreQuestion}
                />
                <p
                  className={
                    seedNoteId
                      ? "creative-seed-save-status is-saved"
                      : "creative-seed-save-status"
                  }
                >
                  {seedTopicId
                    ? "选题和创作种子已保存。可以继续打开工作区，或直接生成知乎草稿。"
                    : seedNoteId
                      ? "创作种子已保存为素材草稿。接下来可继续形成选题，或直接生成知乎草稿。"
                    : "创作种子尚未保存。选择下一步时会自动保存；失败后也可以重试。"}
                </p>
                <div className="creative-seed-result-actions">
                  <button
                    onClick={() => void saveMaterial()}
                    disabled={Boolean(busy)}
                  >
                    {busy === "save" ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Lightbulb size={16} />
                    )}{" "}
                    打开素材草稿
                  </button>
                  <button
                    onClick={() => void continueToTopic()}
                    disabled={Boolean(busy)}
                  >
                    {busy === "topic" ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <ArrowRight size={16} />
                    )}{" "}
                    继续形成选题
                  </button>
                  <button
                    onClick={() => void writeDraft()}
                    disabled={Boolean(busy)}
                  >
                    {busy === "write" ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <PenLine size={16} />
                    )}{" "}
                    生成知乎草稿
                  </button>
                </div>
              </div>
            )}

            {message && <p className="creative-seed-message">{message}</p>}
          </section>
        </div>
      )}
    </>
  );
}

function SeedField({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <section
      className={
        emphasis ? "creative-seed-field is-emphasis" : "creative-seed-field"
      }
    >
      <strong>{label}</strong>
      <p>{value}</p>
    </section>
  );
}
