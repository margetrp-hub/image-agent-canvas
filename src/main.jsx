import React, { Component, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_DISPLAY_NAME = '图片插件';

function Home() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetch('/health')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (isMounted) setHealth(payload);
      })
      .catch(() => {
        if (isMounted) setHealth({ ok: false });
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const openCanvas = () => {
    window.location.assign('/canvas/');
  };

  return (
    <main className="iac-home">
      <section className="iac-home-panel" aria-labelledby="iac-home-title">
        <p className="iac-home-kicker">{APP_DISPLAY_NAME}</p>
        <h1 id="iac-home-title">图片插件正在运行。</h1>
        <p className="iac-home-copy">
          本页用于确认本地服务已启动，再进入图片编辑工作区。
        </p>
        <dl className="iac-home-status" aria-label="服务状态">
          <div>
            <dt>状态</dt>
            <dd>{health?.ok ? '运行中' : health === null ? '检查中' : '不可用'}</dd>
          </div>
          <div>
            <dt>文件位置</dt>
            <dd>{health?.canvasRoot ?? '等待健康检查'}</dd>
          </div>
        </dl>
        <div className="iac-home-actions">
          <button type="button" onClick={openCanvas}>
            打开{APP_DISPLAY_NAME}
          </button>
          <a href="/health" target="_blank" rel="noreferrer">
            健康检查
          </a>
        </div>
      </section>
    </main>
  );
}

class CanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="iac-status" aria-live="polite">
          {APP_DISPLAY_NAME}启动失败。请检查本地服务状态后刷新。
        </main>
      );
    }

    return this.props.children;
  }
}

function CanvasRoute() {
  const CanvasApp = React.lazy(() => import('./App.jsx'));

  return (
    <CanvasErrorBoundary>
      <React.Suspense
        fallback={
          <main className="iac-status" aria-live="polite">
            正在加载{APP_DISPLAY_NAME}...
          </main>
        }
      >
        <CanvasApp />
      </React.Suspense>
    </CanvasErrorBoundary>
  );
}

const path = window.location.pathname.replace(/\/+$/, '');
const route = path === '/canvas' ? <CanvasRoute /> : <Home />;

createRoot(document.getElementById('root')).render(route);
