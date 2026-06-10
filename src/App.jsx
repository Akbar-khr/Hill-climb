import { useState, useEffect, useRef, useCallback } from "react";

const GRAVITY = 0.5;
const FRICTION = 0.98;
const TORQUE = 0.08;
const DRIVE_FORCE = 0.35;
const BRAKE_FORCE = 0.25;
const MAX_SPEED = 12;
const WHEEL_RADIUS = 18;
const FUEL_MAX = 100;
const FUEL_DRAIN = 0.04;

function generateTerrain(startX = 0, count = 120) {
  const points = [];
  let x = startX;
  let y = 320;
  for (let i = 0; i < count; i++) {
    points.push({ x, y });
    x += 80 + Math.random() * 40;
    const hillType = Math.random();
    if (hillType < 0.3) y += (Math.random() - 0.3) * 120;
    else if (hillType < 0.6) y -= (Math.random() - 0.3) * 100;
    else y += (Math.random() - 0.5) * 60;
    y = Math.max(160, Math.min(460, y));
  }
  return points;
}

function getTerrainY(terrain, x) {
  for (let i = 0; i < terrain.length - 1; i++) {
    if (x >= terrain[i].x && x <= terrain[i + 1].x) {
      const t = (x - terrain[i].x) / (terrain[i + 1].x - terrain[i].x);
      return terrain[i].y + t * (terrain[i + 1].y - terrain[i].y);
    }
  }
  return terrain[terrain.length - 1]?.y ?? 300;
}

function getTerrainAngle(terrain, x) {
  for (let i = 0; i < terrain.length - 1; i++) {
    if (x >= terrain[i].x && x <= terrain[i + 1].x) {
      const dy = terrain[i + 1].y - terrain[i].y;
      const dx = terrain[i + 1].x - terrain[i].x;
      return Math.atan2(dy, dx);
    }
  }
  return 0;
}

function generateCoins(terrain) {
  return terrain
    .filter((_, i) => i % 8 === 4)
    .map((pt) => ({ x: pt.x, y: pt.y - 50, collected: false }));
}

const CAR_W = 80;
const CAR_H = 36;

export default function HillClimbGame() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const keysRef = useRef({ gas: false, brake: false });
  const animRef = useRef(null);
  const [ui, setUi] = useState({ fuel: FUEL_MAX, score: 0, coins: 0, dead: false, started: false, distance: 0 });

  const initState = useCallback(() => {
    const terrain = generateTerrain(0, 150);
    const coins = generateCoins(terrain);
    const startY = getTerrainY(terrain, 120) - WHEEL_RADIUS - CAR_H / 2 - 2;
    stateRef.current = {
      car: { x: 120, y: startY, vx: 0, vy: 0, angle: 0, angularV: 0 },
      wheelF: { x: 120 + 28, y: startY + CAR_H / 2, rot: 0 },
      wheelB: { x: 120 - 28, y: startY + CAR_H / 2, rot: 0 },
      terrain,
      coins,
      fuel: FUEL_MAX,
      score: 0,
      coinCount: 0,
      dead: false,
      camera: 0,
      terrainEnd: terrain[terrain.length - 1].x,
    };
  }, []);

  const extendTerrain = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const last = s.terrain[s.terrain.length - 1];
    if (s.car.x + 1200 > last.x) {
      const newPts = generateTerrain(last.x, 60);
      s.terrain.push(...newPts);
      s.coins.push(...generateCoins(newPts));
      s.terrainEnd = s.terrain[s.terrain.length - 1].x;
    }
  }, []);

  const update = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.dead) return;
    const { gas, brake } = keysRef.current;
    const car = s.car;

    // Drive
    if (gas && s.fuel > 0) {
      car.vx += Math.cos(car.angle) * DRIVE_FORCE;
      car.vy += Math.sin(car.angle) * DRIVE_FORCE * 0.4;
      s.fuel = Math.max(0, s.fuel - FUEL_DRAIN);
    }
    if (brake) {
      car.vx -= Math.abs(car.vx) > 0.1 ? car.vx * BRAKE_FORCE : car.vx;
      car.angularV -= car.angularV * 0.1;
    }
    if (car.vx > MAX_SPEED) car.vx = MAX_SPEED;
    if (car.vx < -MAX_SPEED / 2) car.vx = -MAX_SPEED / 2;

    car.vy += GRAVITY;
    car.vx *= FRICTION;
    car.vy *= FRICTION;
    car.x += car.vx;
    car.y += car.vy;

    // Terrain collision
    const fwX = car.x + Math.cos(car.angle) * 28;
    const bwX = car.x - Math.cos(car.angle) * 28;
    const terrainYF = getTerrainY(s.terrain, fwX) - WHEEL_RADIUS;
    const terrainYB = getTerrainY(s.terrain, bwX) - WHEEL_RADIUS;
    const targetAngle = Math.atan2(terrainYF - terrainYB, fwX - bwX);

    // Settle car on terrain
    const midTerrainY = (terrainYF + terrainYB) / 2 - CAR_H / 2 + 4;
    if (car.y + CAR_H / 2 >= midTerrainY + CAR_H / 2) {
      car.y += (midTerrainY - car.y) * 0.3;
      car.vy *= -0.2;
      car.vx *= 0.97;
    }
    car.angle += (targetAngle - car.angle) * 0.2;
    car.angularV *= 0.85;

    // Wheel positions
    s.wheelF.x = car.x + Math.cos(car.angle) * 28;
    s.wheelF.y = getTerrainY(s.terrain, s.wheelF.x) - WHEEL_RADIUS / 2;
    s.wheelB.x = car.x - Math.cos(car.angle) * 28;
    s.wheelB.y = getTerrainY(s.terrain, s.wheelB.x) - WHEEL_RADIUS / 2;

    // Wheel rotation
    const rotSpeed = car.vx / WHEEL_RADIUS;
    s.wheelF.rot = (s.wheelF.rot + rotSpeed) % (Math.PI * 2);
    s.wheelB.rot = (s.wheelB.rot + rotSpeed) % (Math.PI * 2);

    // Coins
    s.coins.forEach((c) => {
      if (!c.collected && Math.abs(c.x - car.x) < 36 && Math.abs(c.y - car.y) < 36) {
        c.collected = true;
        s.coinCount += 1;
        s.score += 10;
      }
    });

    // Distance score
    s.score = Math.floor(Math.max(s.score, (car.x - 120) / 10)) + s.coinCount * 10;

    // Death check — flipped or fuel out
    if (Math.abs(car.angle) > 1.4 || s.fuel <= 0) {
      s.dead = true;
    }

    // Camera
    s.camera = car.x - 200;
    extendTerrain();

    setUi({
      fuel: Math.round(s.fuel),
      score: s.score,
      coins: s.coinCount,
      dead: s.dead,
      started: true,
      distance: Math.max(0, Math.floor((car.x - 120) / 10)),
    });
  }, [extendTerrain]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;
    if (!s) return;
    const W = canvas.width;
    const H = canvas.height;
    const cam = s.camera;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#87CEEB");
    sky.addColorStop(1, "#d4eaf7");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Clouds (static deco)
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    [[100, 60, 60], [300, 40, 45], [560, 70, 55], [750, 50, 40]].forEach(([cx, cy, r]) => {
      const ox = ((cx - cam * 0.2) % (W + 120) + W + 120) % (W + 120) - 60;
      ctx.beginPath();
      ctx.arc(ox, cy, r, 0, Math.PI * 2);
      ctx.arc(ox + r * 0.6, cy - r * 0.3, r * 0.7, 0, Math.PI * 2);
      ctx.arc(ox - r * 0.5, cy - r * 0.2, r * 0.65, 0, Math.PI * 2);
      ctx.fill();
    });

    // Terrain fill
    ctx.beginPath();
    ctx.moveTo(0, H);
    s.terrain.forEach((pt) => {
      const sx = pt.x - cam;
      if (sx > -80 && sx < W + 80) ctx.lineTo(sx, pt.y);
    });
    ctx.lineTo(W, H);
    ctx.closePath();
    const terrainGrad = ctx.createLinearGradient(0, 200, 0, H);
    terrainGrad.addColorStop(0, "#5a8c3a");
    terrainGrad.addColorStop(0.15, "#7ab648");
    terrainGrad.addColorStop(0.3, "#8B6914");
    terrainGrad.addColorStop(1, "#6b4f1a");
    ctx.fillStyle = terrainGrad;
    ctx.fill();

    // Terrain line
    ctx.beginPath();
    ctx.strokeStyle = "#3a6e20";
    ctx.lineWidth = 3;
    s.terrain.forEach((pt, i) => {
      const sx = pt.x - cam;
      if (sx > -80 && sx < W + 80) {
        i === 0 ? ctx.moveTo(sx, pt.y) : ctx.lineTo(sx, pt.y);
      }
    });
    ctx.stroke();

    // Coins
    s.coins.forEach((c) => {
      if (c.collected) return;
      const cx = c.x - cam;
      if (cx < -30 || cx > W + 30) return;
      // Coin glow
      const glow = ctx.createRadialGradient(cx, c.y, 2, cx, c.y, 14);
      glow.addColorStop(0, "#FFE033");
      glow.addColorStop(0.6, "#FFB800");
      glow.addColorStop(1, "rgba(255,180,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, c.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.arc(cx, c.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFE87C";
      ctx.beginPath();
      ctx.arc(cx - 3, c.y - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#B8860B";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, c.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw car
    const car = s.car;
    const sx = car.x - cam;
    ctx.save();
    ctx.translate(sx, car.y);
    ctx.rotate(car.angle);

    // Car body shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, CAR_H / 2 + 6, CAR_W / 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Car body
    ctx.fillStyle = "#E63C1E";
    ctx.beginPath();
    ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 8);
    ctx.fill();

    // Cabin
    ctx.fillStyle = "#C02A10";
    ctx.beginPath();
    ctx.roundRect(-14, -CAR_H / 2 - 20, 36, 22, [6, 6, 0, 0]);
    ctx.fill();

    // Windows
    ctx.fillStyle = "rgba(180,230,255,0.85)";
    ctx.beginPath();
    ctx.roundRect(-10, -CAR_H / 2 - 17, 28, 14, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Headlight
    ctx.fillStyle = "#FFEE99";
    ctx.beginPath();
    ctx.ellipse(CAR_W / 2 - 4, -4, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Car outline
    ctx.strokeStyle = "#9B1A04";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 8);
    ctx.stroke();

    ctx.restore();

    // Draw wheels
    [s.wheelF, s.wheelB].forEach((w) => {
      const wx = w.x - cam;
      ctx.save();
      ctx.translate(wx, w.y);
      ctx.rotate(w.rot);

      // Tire
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(0, 0, WHEEL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Tread lines
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (WHEEL_RADIUS - 5), Math.sin(a) * (WHEEL_RADIUS - 5));
        ctx.lineTo(Math.cos(a) * WHEEL_RADIUS, Math.sin(a) * WHEEL_RADIUS);
        ctx.stroke();
      }

      // Hub
      ctx.fillStyle = "#ccc";
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#888";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 4, Math.sin(a) * 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

    // Dead overlay
    if (s.dead) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, H);
    }
  }, []);

  const loop = useCallback(() => {
    update();
    draw();
    animRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  const startGame = useCallback(() => {
    initState();
    setUi({ fuel: FUEL_MAX, score: 0, coins: 0, dead: false, started: true, distance: 0 });
  }, [initState]);

  useEffect(() => {
    initState();
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [initState, loop]);

  // Touch controls
  const handleGasStart = () => { keysRef.current.gas = true; };
  const handleGasEnd = () => { keysRef.current.gas = false; };
  const handleBrakeStart = () => { keysRef.current.brake = true; };
  const handleBrakeEnd = () => { keysRef.current.brake = false; };

  // Keyboard fallback
  useEffect(() => {
    const down = (e) => {
      if (e.key === "ArrowRight") keysRef.current.gas = true;
      if (e.key === "ArrowLeft") keysRef.current.brake = true;
    };
    const up = (e) => {
      if (e.key === "ArrowRight") keysRef.current.gas = false;
      if (e.key === "ArrowLeft") keysRef.current.brake = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const fuelColor = ui.fuel > 50 ? "#4ade80" : ui.fuel > 25 ? "#facc15" : "#f87171";

  return (
    <div style={{ background: "#1a1a2e", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", userSelect: "none" }}>
      {/* Header */}
      <div style={{ width: 800, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px", marginBottom: 4 }}>
        <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: 1 }}>
          🏎️ <span style={{ color: "#FFD700" }}>HILL</span> CLIMBER
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#aaa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Jarak</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{ui.distance}m</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#aaa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Koin</div>
            <div style={{ color: "#FFD700", fontWeight: 700, fontSize: 16 }}>🪙 {ui.coins}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#aaa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Skor</div>
            <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 16 }}>{ui.score}</div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position: "relative" }}>
        <canvas ref={canvasRef} width={800} height={480} style={{ borderRadius: 12, display: "block", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }} />

        {/* Fuel bar */}
        <div style={{ position: "absolute", top: 12, left: 12, width: 140 }}>
          <div style={{ color: "#fff", fontSize: 11, fontWeight: 600, marginBottom: 3, textShadow: "0 1px 3px #000" }}>⛽ BAHAN BAKAR</div>
          <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 8, height: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)" }}>
            <div style={{ width: `${ui.fuel}%`, height: "100%", background: fuelColor, borderRadius: 8, transition: "width 0.2s, background 0.5s", boxShadow: `0 0 8px ${fuelColor}` }} />
          </div>
        </div>

        {/* Dead overlay */}
        {ui.dead && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
            <div style={{ background: "rgba(0,0,0,0.85)", padding: "28px 48px", borderRadius: 16, textAlign: "center", border: "2px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 40 }}>{ui.fuel <= 0 ? "⛽" : "💥"}</div>
              <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, marginTop: 8 }}>
                {ui.fuel <= 0 ? "Kehabisan Bensin!" : "Mobil Terbalik!"}
              </div>
              <div style={{ color: "#aaa", fontSize: 13, margin: "8px 0 16px" }}>
                Jarak: <b style={{ color: "#fff" }}>{ui.distance}m</b> · Koin: <b style={{ color: "#FFD700" }}>{ui.coins}</b> · Skor: <b style={{ color: "#4ade80" }}>{ui.score}</b>
              </div>
              <button
                onClick={startGame}
                style={{ background: "linear-gradient(135deg, #E63C1E, #ff6b4a)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 15px rgba(230,60,30,0.5)" }}
              >
                🔄 Main Lagi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
        <button
  onPointerDown={handleBrakeStart}
  onPointerUp={handleBrakeEnd}
  onPointerLeave={handleBrakeEnd}
  onContextMenu={(e) => e.preventDefault()}
  onTouchStart={(e) => { e.preventDefault(); handleBrakeStart(); }}
  onTouchEnd={(e) => { e.preventDefault(); handleBrakeEnd(); }}
  style={{
    background: "linear-gradient(135deg, #1e40af, #3b82f6)",
    color: "#fff", border: "none", borderRadius: 16,
    padding: "18px 40px", fontSize: 22, fontWeight: 900,
    cursor: "pointer", boxShadow: "0 4px 20px rgba(59,130,246,0.4)",
    letterSpacing: 1, minWidth: 130,
    touchAction: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    WebkitTouchCallout: "none"
  }}
>
  ◀ REM
</button>
<button
  onPointerDown={handleGasStart}
  onPointerUp={handleGasEnd}
  onPointerLeave={handleGasEnd}
  onContextMenu={(e) => e.preventDefault()}
  onTouchStart={(e) => { e.preventDefault(); handleGasStart(); }}
  onTouchEnd={(e) => { e.preventDefault(); handleGasEnd(); }}
  style={{
    background: "linear-gradient(135deg, #15803d, #22c55e)",
    color: "#fff", border: "none", borderRadius: 16,
    padding: "18px 40px", fontSize: 22, fontWeight: 900,
    cursor: "pointer", boxShadow: "0 4px 20px rgba(34,197,94,0.4)",
    letterSpacing: 1, minWidth: 130,
    touchAction: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    WebkitTouchCallout: "none"
  }}
>
  GAS ▶
</button>
