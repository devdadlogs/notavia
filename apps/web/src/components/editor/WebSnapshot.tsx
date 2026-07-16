interface WebSnapshotProps {
  html: string;
  sourceUrl?: string;
}

export default function WebSnapshot({ html, sourceUrl }: WebSnapshotProps) {
  const isWeChat = sourceUrl?.startsWith('https://mp.weixin.qq.com/') ?? false;

  return (
    <section className="web-snapshot" aria-label="导入网页原文">
      <article
        className={`web-snapshot-content${isWeChat ? ' web-snapshot-content--wechat' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
