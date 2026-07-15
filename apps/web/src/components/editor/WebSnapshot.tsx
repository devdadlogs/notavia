import { ExternalLink } from 'lucide-react';

interface WebSnapshotProps {
  html: string;
  sourceUrl?: string;
}

export default function WebSnapshot({ html, sourceUrl }: WebSnapshotProps) {
  return (
    <section className="web-snapshot" aria-label="导入网页原文">
      <div className="web-snapshot-banner">
        <div>
          <strong>原始素材</strong>
          <span>保留导入时的图文结构和多媒体内容</span>
        </div>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> 打开来源
          </a>
        )}
      </div>
      <article className="web-snapshot-content" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
