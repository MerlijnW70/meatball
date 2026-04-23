/**
 * Genereer een shareable rating-card via Canvas en deel 'm via de Web
 * Share API (iOS/Android). Fallback: download als PNG + open wa.me met
 * tekst-alleen zodat de user zelf ervoor kan plakken.
 */

const CANVAS_SIZE = 1080; // Instagram-friendly square

interface ShareInput {
  snackName: string;
  clubName: string;
  score: number; // 1..10
  raterName: string;
  raterAvatarColor: string; // palette key ("pop", "hot", ...)
  raterAvatarIcon: string;
}

const PALETTE: Record<string, string> = {
  pop: "#FFE14D",
  hot: "#FF3D2E",
  mint: "#00D2A0",
  sky: "#4D7CFF",
  bruise: "#B87DFF",
  ink: "#0A0A0A",
  paper: "#FFFCF2",
};

function colorFor(key: string, fallback = "#FFE14D"): string {
  return PALETTE[key] ?? fallback;
}

/** Tint per score-band, consistent met ScorePill/scoreColor. */
function bgForScore(s: number): string {
  if (s >= 8) return PALETTE.mint;
  if (s >= 6.5) return PALETTE.pop;
  if (s >= 5) return PALETTE.sky;
  return PALETTE.hot;
}

export async function renderRatingCard(input: ShareInput): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Achtergrond = score-tint
  ctx.fillStyle = bgForScore(input.score);
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Brutalist paper-card binnenin met dikke ink-rand
  const m = 80;
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(m, m, CANVAS_SIZE - 2 * m, CANVAS_SIZE - 2 * m);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 20;
  ctx.strokeRect(m, m, CANVAS_SIZE - 2 * m, CANVAS_SIZE - 2 * m);

  // Header-balk ink met paper-tekst — like TopBar
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(m, m, CANVAS_SIZE - 2 * m, 140);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = "900 56px 'Archivo Black', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("MEATBALL", m + 40, m + 72);

  // Grote score rechtsboven
  ctx.fillStyle = PALETTE.pop;
  const scoreBoxW = 220, scoreBoxH = 220;
  const scoreX = CANVAS_SIZE - m - 40 - scoreBoxW;
  const scoreY = m + 200;
  ctx.save();
  ctx.translate(scoreX + scoreBoxW / 2, scoreY + scoreBoxH / 2);
  ctx.rotate(-0.04); // -2.3°
  ctx.fillStyle = bgForScore(input.score);
  ctx.fillRect(-scoreBoxW / 2, -scoreBoxH / 2, scoreBoxW, scoreBoxH);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 12;
  ctx.strokeRect(-scoreBoxW / 2, -scoreBoxH / 2, scoreBoxW, scoreBoxH);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "900 160px 'Archivo Black', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(input.score), 0, 10);
  ctx.restore();

  // Club-naam + snack-naam
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "900 48px 'Archivo Black', system-ui, sans-serif";
  const snackY = m + 220;
  wrapText(ctx, input.snackName.toUpperCase(), m + 60, snackY,
    CANVAS_SIZE - 2 * m - 320, 56);
  ctx.font = "700 36px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = "#555";
  ctx.fillText(`BIJ ${input.clubName.toUpperCase()}`, m + 60, snackY + 140);

  // Rater-row onderaan
  const ry = CANVAS_SIZE - m - 160;
  const avatarD = 120;
  const avatarX = m + 60;
  // Avatar bg
  ctx.fillStyle = colorFor(input.raterAvatarColor);
  ctx.fillRect(avatarX, ry, avatarD, avatarD);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 10;
  ctx.strokeRect(avatarX, ry, avatarD, avatarD);
  // Emoji-icon (browser-rendered emoji)
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "80px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(input.raterAvatarIcon, avatarX + avatarD / 2, ry + avatarD / 2 + 8);

  // Rater-naam + "heeft geraat"
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "900 44px 'Archivo Black', system-ui, sans-serif";
  ctx.fillText(input.raterName.toUpperCase(), avatarX + avatarD + 30, ry + 18);
  ctx.font = "700 28px 'Inter', system-ui, sans-serif";
  ctx.fillStyle = "#555";
  ctx.fillText("gaf deze gehaktbal een cijfer", avatarX + avatarD + 30, ry + 72);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.92));
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const width = ctx.measureText(test).width;
    if (width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

/** Probeer te delen via Web Share API met bestand. Valt terug op
 *  wa.me-link met tekst als bestand-share niet kan. */
export async function shareRating(input: ShareInput): Promise<void> {
  const msg =
    `🥩 ${input.raterName} gaf de gehaktbal bij ${input.clubName}` +
    ` een ${input.score}/10\n\n` +
    `Check 't in de Meatball-app: ${location.origin}${location.pathname}`;

  const blob = await renderRatingCard(input);
  const file = blob
    ? new File([blob], "meatball-rating.png", { type: "image/png" })
    : null;

  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[]; text?: string; url?: string }) => boolean;
    share?: (d: { files?: File[]; text?: string; title?: string; url?: string }) => Promise<void>;
  };

  // iOS+Android Web Share API met bestand (als beschikbaar)
  if (file && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        text: msg,
        title: `Meatball · ${input.clubName}`,
      });
      return;
    } catch {
      // user cancelde of share flopte — val terug
    }
  }

  // Fallback 1: tekst-only share
  if (nav.share) {
    try {
      await nav.share({ text: msg, title: "Meatball" });
      return;
    } catch { /* ignore */ }
  }

  // Fallback 2: download de PNG + open wa.me in nieuwe tab
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meatball-rating.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
}
