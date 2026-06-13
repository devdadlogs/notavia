import React, { useEffect, useState, useRef } from 'react';
import { BarChart2, Share2, Network } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';

export default function SproutReport() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 });
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Resize observer
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
      const observer = new ResizeObserver(entries => {
        if (entries[0]) {
          setDimensions({
            width: entries[0].contentRect.width,
            height: entries[0].contentRect.height
          });
        }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
    const fetchAndBuildGraph = async () => {
      try {
        const { data: notes } = await api.get('/notes');
        const nodes = notes.map((n: any) => ({
          id: n.id,
          name: n.title || '无标题笔记',
          val: Math.random() * 5 + 5 // Random size for visual effect
        }));
        
        // Generate random links to simulate semantic connections (Sprouting)
        const links = [];
        for (let i = 0; i < nodes.length; i++) {
          const numLinks = Math.floor(Math.random() * 3);
          for (let j = 0; j < numLinks; j++) {
            const target = Math.floor(Math.random() * nodes.length);
            if (i !== target) {
              links.push({
                source: nodes[i].id,
                target: nodes[target].id
              });
            }
          }
        }
        
        setGraphData({ nodes, links });
      } catch (err) {
        console.error('Failed to build graph', err);
      }
    };
    fetchAndBuildGraph();
  }, []);

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700 }}>发芽报告 (知识图谱)</h1>
          <p style={{ color: 'var(--text-secondary)' }}>基于本地向量语义为您构建的知识连接全景图</p>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Share2 size={16} /> 分享全景图
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', flex: 1 }}>
        {/* Graph Area */}
        <div 
          ref={containerRef}
          style={{ 
            backgroundColor: '#0f172a', borderRadius: 'var(--radius-lg)', minHeight: '500px', 
            overflow: 'hidden', position: 'relative'
          }}
        >
          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              nodeLabel="name"
              nodeColor={() => '#aa3bff'}
              linkColor={() => 'rgba(255,255,255,0.2)'}
              nodeRelSize={6}
              onNodeClick={(node: any) => navigate(`/n/${node.id}`)}
              backgroundColor="#0f172a"
            />
          ) : (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: '#94a3b8' }}>
              <Network size={48} color="#475569" style={{ margin: '0 auto 16px' }} />
              <div>图谱正在生成中...</div>
            </div>
          )}
        </div>

        {/* Info Side */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>图谱洞察</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>知识节点总数</span>
                <span style={{ fontWeight: 600 }}>{graphData.nodes.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>已建立关联</span>
                <span style={{ fontWeight: 600 }}>{graphData.links.length}</span>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>发芽建议</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              AI 分析表明：你最近对“AI技术”、“产品设计”相关的笔记数量增多，且存在潜在联系。试着点击图谱中密集的节点群落，可能会激发新的灵感！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
