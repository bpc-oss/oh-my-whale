// dsh-continuous-worker — 全息粒子背景 (调研落地).
//
// 两个模式:
//   canvas: 轻量 Canvas 粒子 (magicui/particles 简化: 漂移 + 鼠标磁吸 + 边缘渐隐),
//           零依赖, ~60 行;
//   css:    CSS 粒子 (20-40 个光点 div + cw-drift 动画), 更轻, 静态漂移。
// 默认 css (性能友好); canvas 用于需要"活粒子" (鼠标磁吸) 时。

import React, { useEffect, useRef } from "react";

/** Canvas 粒子 (鼠标磁吸/漂移/渐隐). */
export function CanvasParticles({ count = 40, color = "#38bdf8", className }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let w = 0; let h = 0;
    const resize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    resize();
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - .5) * .25,
      vy: (Math.random() - .5) * .25,
      r: Math.random() * 1.6 + .4,
      o: Math.random() * .5 + .3,
    }));
    const mouse = { x: -1e4, y: -1e4 };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = -1e4; mouse.y = -1e4; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        // 鼠标磁吸 (近距离)
        const dx = mouse.x - p.x; const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 120) { p.vx += (dx / dist) * .008; p.vy += (dy / dist) * .008; }
        // 阻尼 + 漂移
        p.vx *= .98; p.vy *= .98;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.globalAlpha = p.o;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); window.removeEventListener("resize", onResize); };
  }, [count, color]);
  return <canvas ref={ref} className={className} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }} />;
}

/** CSS 粒子 (性能友好: 20-40 个光点 div). */
export function CssParticles({ count = 26 }) {
  const parts = React.useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: `${(i * 137 + 7) % 100}%`,
      top: `${(i * 61 + 13) % 100}%`,
      t: `${8 + (i % 6)}s`,
      o: .3 + ((i * 7) % 40) / 100,
      dx: `${((i * 29) % 60) - 30}px`,
      dy: `${-((i * 17) % 50) - 10}px`,
    })),
    [count]
  );
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className="cw-particle" style={{ left: p.left, top: p.top, ["--t"]: p.t, ["--o"]: p.o, ["--dx"]: p.dx, ["--dy"]: p.dy, animationDelay: `${i * 0.35}s` }} />
      ))}
    </>
  );
}

/** 统一入口: 默认 CSS 粒子, mode="canvas" 用 Canvas. */
export default function Particles({ mode = "css", count, color, className }) {
  if (mode === "canvas") return <CanvasParticles count={count} color={color} className={className} />;
  return <div className={className} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}><CssParticles count={count} /></div>;
}
